#!/usr/bin/env node


//==========================================================//
//                                                          //
//                    Hostfile-mDNS (v1.0)                  //
//                                <kim.hwiwon@outlook.com>  //
//                                                          //
// Simple mDNS server utilizing hostfile-like config file,  //
//    syncing hostfile between heirarachical mDNS nodes     //
//                                                          //
//==========================================================//

// additional required packages: multicast-dns, object-hash


// imports
const fs = require('fs')
const http = require('http')
const mdns = require('multicast-dns');
const hash = require('object-hash');


// env - common node
const hostname = process.env.HMDNS_HOSTNAME || '0.0.0.0';
const port = process.env.HMDNS_PORT || 5353;
const ttl = process.env.HMDNS_TTL || 3600;

// env - mirror node
const parentHostname = process.env.HMDNS_PARENT_HOSTNAME || null;
const parentPort = process.env.HMDNS_PARENT_PORT || 5353;
const parentSyncInterval = process.env.HMDNS_PARENT_SYNC_INTERVAL || 60;

// env - internal
const healthcheckDomain = process.env.HEALTHCHECK_DOMAIN || null;




//=============================//
//            Main             //
//=============================//


// main routine
function main() {
    log(` * Starting Hostfile-mDNS with following environments: `, {
        HMDNS_HOSTNAME: hostname,
        HMDNS_PORT: port,
        HMDNS_TTL: ttl,
        HMDNS_PARENT_HOSTNAME: parentHostname,
        HMDNS_PARENT_PORT: parentPort,
        HMDNS_PARENT_SYNC_INTERVAL: parentSyncInterval
    });

    // args
    if ( process.argv.length < 3 ) { log(" * No host file path argument!"); process.exit(1); }
    const hostfile = process.argv[2];

    // create hostfile on init if not exists
    if ( ! fs.existsSync(hostfile) ) {
        try {
            fs.writeFileSync(
                hostfile,
                "# line format: <target-ip> <src-domain-1.local> [src-domain-2.local] ...\n"
                    + "#   e.g.) 192.168.1.1  mdns-domain.local another-domain.local third-domain.local\n"
            );
        } catch (err) {
            if (err) {
                log(' * Failed to write to hostfile: ', err);
            }
        }
    }



    // map pointer
    var hostMapHolder = { val: null, file: hostfile };


    // start watching hostfile
    hfWatcher(hostMapHolder);

    // start serving hostfile
    hfServer(hostMapHolder);

    // start syncing hostfile if mirror mode
    if (parentHostname) {
        hfSyncer(hostMapHolder);
    }

    // start listening
    mDnsServer(hostMapHolder);
}





//=============================//
//          Services           //
//=============================//


// start mdns with given hostmap holder
function mDnsServer(hostMapHolder) {
    log(` + mDnsServer(): mDns server start listening at '${hostname}:${port}' (udp) ...`);

    const server = mdns({interface: hostname, port: port});
    server.on('warning', function (err) {
        log(err.stack)
    })

    server.on('query', function (query) {
        const hostMap = hostMapHolder.val;

        // iterate over all questions to check if we should respond
        query.questions.forEach(function (q) {
            if (q.type === 'A' && hostMap?.map[q.name]) {

                if (q.name !== healthcheckDomain) {
                    log(` + mDnsServer(): Incomming query [${q.name}] -> [${hostMap.map[q.name]}]`)
                }

                server.respond({
                    answers: [{
                        name: q.name,
                        type: 'A',
                        ttl: ttl,
                        data: hostMap.map[q.name]
                    }]
                })

            }
        })
    })

}


// watch local changes on the file hostfile
function hfWatcher(hostMapHolder) {
    // refresh map on hostfile change
    fs.watchFile(hostMapHolder.file, function refreshHostfile() {
        if ( fs.existsSync(hostMapHolder.file) ) {
            log(" + hfWatcher(): Hostfile change detected.");
            hostMapHolder.val = readHostfile(hostMapHolder.file).val;
        } else {
            log(" + hfWatcher(): Hostfile not found. Clear all mapping.");
            hostMapHolder.val = readHostfile(null).val;
        }

        return refreshHostfile;
    }());
}


// start hostfile server for syncing hostfile across multiple servers
function hfServer(hostMapHolder) {
    const server = http.createServer((req, res) => {
        if (req.method !== 'GET' || req.url !== '/') { res.statusCode = 204; res.end(); return; }

        const curHash = hostMapHolder.val?.hash || "";
        const curMap = hostMapHolder.val?.map || {};
        res.setHeader('ETag', curHash);

        const reqHashs = req.headersDistinct['if-none-match'];
        if ( reqHashs?.includes(curHash) ) {
            res.statusCode = 304;
            res.end();
        } else {
            log(` + hfServer(): Request from '${req.socket.remoteAddress}' - Response with a new hostfile (${hostMapHolder.val?.hash}).`);

            const resMap = JSON.parse(JSON.stringify(curMap));
            delete resMap[healthcheckDomain]; // remove internal healthcheck domain

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end( JSON.stringify(resMap, null, null) );
        }
    });

    server.listen(port, hostname, () => {
        log(` + hfServer(): Hostfile server listening at 'http://${hostname}:${port}/' (tcp) ...`);
    });
}


// start hostfile client for syncing hostfile across multiple servers
function hfSyncer(hostMapHolder) {
    log(` + hfSyncer(): Hostfile syncer requesting to 'http://${parentHostname}:${parentPort}/' ...`);

    setInterval(function syncHostfile() {
        http.request(
            {
                hostname: parentHostname,
                path: "/",
                port: parentPort,
                headers: {
                    "if-none-match": hostMapHolder.val?.hash || ""
                }
            },
            res => {
                if (res.statusCode === 200) {
                    log(` + hfSyncer(): Syncing hostfile with '${parentHostname}' ...`);

                    let eTag = res.headers['ETag'];
                    let resBody = "";

                    res.on("data", d => { resBody += d });

                    res.on("end", () => {
                        const hosts = JSON.parse(resBody);

                        let hostfile = "";
                        for (const [k, v] of Object.entries(hosts)) {
                            hostfile += v + ' ' + k + '\n';
                        }

                        try {
                            fs.writeFileSync(hostMapHolder.file, hostfile);
                        } catch (err) {
                            if (err) {
                                log('   * Failed to write to hostfile: ', err);
                            }
                        }
                    });

                } else if (res.statusCode === 304) {
                    //log(` + hfSyncer(): Hostfile of '${parentHostname}' not changed.`);
                    // do nothing
                } else {
                    log(` + hfSyncer(): Unexpected response while syncing hostfile from parent '${parentHostname}'.`);
                }
            })
            .on("error", (err) => {
                if (err) {
                    log("   * Failed to communicate with the parent: ", err);
                }
            })
            .end();
        return syncHostfile;
    }(), parentSyncInterval * 1000);
}





//=============================//
//           Helpers           //
//=============================//


// read and parse hostfile
function readHostfile(filepath) {

    const hostMapHolder = { val: null, file: filepath };

    if (filepath) {
        log(` - readHostfile(): Reading hostfile: '${filepath}'`);

        try {
            const data = fs.readFileSync(filepath, 'utf8');
            const hostMap = { map: {}, hash: null };

            data.toString().split("\n").forEach(rawLine => {
                const line = rawLine.split('#')[0].replace( /\s+/g, ' ' ).trim();
                if (line.length === 0) { return 0; }

                const tokens = line.split(' ');
                if (tokens.length === 1) {
                    log(`   * Ignoring invalid line on hostfile: [${rawLine}]`); return;
                }

                const target = parseIpv4(tokens[0]);
                if (target) {
                    tokens.slice(1).forEach(function (src) {
                        if (isLocalDomain(src) !== true) {
                            log(`   * Ignoring invalid mDNS domain (.local): [${src}]`); return;
                        }
                        if (hostMap.map[src]) {
                            log(`   * Ignoring duplicated src on hostfile: [${src}]`); return;
                        }
                        hostMap.map[src] = target;
                        log(`   - Hostmap rule added: [${src}] -> [${target}]`);
                    });
                } else {
                    log(`   * Ignoring invalid target IP [${tokens[0]}]`);
                }

            });

            hostMap.hash = hash(hostMap.map);

            hostMap.map[healthcheckDomain] = "127.0.0.1" // internal healthcheck domain

            hostMapHolder.val = hostMap;
        } catch (err) {
            if (err) {
                log("   * Hostfile read error: ", err);
            }
        }
    } else {
        const hostMap = { map: {}, hash: null };
        hostMap.hash = hash(hostMap.map);
        hostMap.map[healthcheckDomain] = "127.0.0.1" // internal healthcheck domain
        hostMapHolder.val = hostMap;
    }


    return hostMapHolder;
}


function parseIpv4(input) {
    const regex = /^(2(?:5[0-5]|[0-4]\d)|1\d{2}|0?[1-9]\d|(?:00)?\d)\.(2(?:5[0-5]|[0-4]\d)|1\d{2}|0?[1-9]\d|(?:00)?\d)\.(2(?:5[0-5]|[0-4]\d)|1\d{2}|0?[1-9]\d|(?:00)?\d)\.(2(?:5[0-5]|[0-4]\d)|1\d{2}|0?[1-9]\d|(?:00)?\d)$/g; // ipv4 regex
    return input?.matchAll(regex)?.next()?.value?.slice(1, 5).map((x) => parseInt(x)).join('.');
}


function isLocalDomain(input) {
    return /^.*[^.]\.local$/.test(input);
}


// logger
function log(...args) {
    console.log(`[${new Date().toISOString()}]`, ...args);
}







////////////////
// start main //
////////////////
main();
