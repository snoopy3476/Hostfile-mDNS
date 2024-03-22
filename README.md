# Hostfile-mDNS: Simple Multicast DNS Server with Hostfile

Simple mDNS server utilizing hostfile-like config file, syncing config between hierarchical mDNS nodes


## Features

- `mDNS-server`
  - Run mDNS server with a simple, hostfile-like config file
- `hostfile-sync`
  - Build mDNS networks across multiple subnets with `hostfile-sync` function, syncing parent and children nodes
    - (Optional) Set `HMDNS_PARENT_HOSTNAME` container environment variable to the address of the sync parent. If not set, `hostfile-sync` function is disabled
    - Note: mDNS requests/responses from other mDNS server are not forwarded, only hostfiles of this server are synced
    - When a child Hostfile-mDNS cannot connect to the parent, hostfile of the child remains untouched until connected


## Getting Started

- All commands below are for POSIX shell environments.
- Make sure the host local port `5353` (default, both TCP and UDP) is not in use.

### Command-only method

- Deploy

  - `podman`

    ```shell
    # export HMDNS_PARENT_HOSTNAME=parent.address.to.sync   # uncomment to sync with parent

    podman run -d --network host -v hmdns-config:/config \
               --health-cmd "/healthcheck" --name "hmdns" \
               -e HMDNS_PARENT_HOSTNAME \
               docker.io/snoopy3476/hostfile-mdns:v1.0
    ```

  - `docker`

    ```shell
    # export HMDNS_PARENT_HOSTNAME=parent.address.to.sync   # uncomment to sync with parent

    docker run -d --network host -v hmdns-config:/config \
               --health-cmd "/healthcheck" --name "hmdns" \
               -e HMDNS_PARENT_HOSTNAME \
               docker.io/snoopy3476/hostfile-mdns:v1.0
    ```

- Configure

  - `podman`

    ```shell
    podman exec -it hmdns hostfile read   # print hostfile
    podman exec -it hmdns hostfile edit   # edit hostfile with vi command
    podman exec -it hmdns hostfile write   # write to hostfile from [stdin]

    # e.g.) replace inner hostfile with a new file 'new-list'
    # podman exec -i hmdns hostfile write < new-list
    ```

  - `docker`

    ```shell
    docker exec -it hmdns hostfile read   # print hostfile
    docker exec -it hmdns hostfile edit   # edit hostfile with vi command
    docker exec -it hmdns hostfile write   # write to hostfile from [stdin]

    # e.g.) replace inner hostfile with a new file 'new-list'
    # docker exec -i hmdns hostfile write < new-list
    ```


- C.f.)

  - It is also possible to bind-mounting `/etc/hosts` on the host directly, without managing the internal file `hosts` in the volume

    ```shell
    # podman
    podman run -d --network host -v /etc/hosts:/config/hosts \
        --health-cmd "/healthcheck" --name "hmdns" \
        docker.io/snoopy3476/hostfile-mdns:v1.0

    # docker
    docker run -d --network host -v /etc/hosts:/config/hosts \
        --health-cmd "/healthcheck" --name "hmdns" \
        docker.io/snoopy3476/hostfile-mdns:v1.0
    ```


### With `compose.yml` file

- Deploy

  - `podman`

    ```shell
    # echo "HMDNS_PARENT_HOSTNAME=parent.address.to.sync" >> .env   # uncomment to sync with parent

    curl -fLO https://github.com/snoopy3476/Hostfile-mDNS/releases/download/v1.0/compose.yml \
      && podman-compose up -d
    ```

  - `docker`

    ```shell
    # echo "HMDNS_PARENT_HOSTNAME=parent.address.to.sync" >> .env   # uncomment to sync with parent

    curl -fLO https://github.com/snoopy3476/Hostfile-mDNS/releases/download/v1.0/compose.yml \
      && docker compose up -d
    ```


- Configure

  - `podman`

    ```shell
    podman-compose exec hmdns hostfile read   # print hostfile
    podman-compose exec hmdns hostfile edit   # edit hostfile with vi command
    podman-compose exec hmdns hostfile write   # write to hostfile from [stdin]

    # e.g.) replace inner hostfile with a new file 'new-list'
    # podman-compose exec -T hmdns hostfile write < new-list
    ```

  - `docker`

    ```shell
    docker compose exec hmdns hostfile read   # print hostfile
    docker compose exec hmdns hostfile edit   # edit hostfile with vi command
    docker compose exec hmdns hostfile write   # write to hostfile from [stdin]

    # e.g.) replace inner hostfile with a new file 'new-list'
    # docker compose exec -T hmdns hostfile write < new-list
    ```


- C.f.)

  - It is also possible to bind-mounting `/etc/hosts` on the host directly, without managing the internal file `hosts` in the volume

    ```shell
    # podman
    curl -fL https://github.com/snoopy3476/Hostfile-mDNS/releases/download/v1.0/compose-global-hostfile.yml -o compose.yml \
      && podman-compose up -d

    # docker
    curl -fL https://github.com/snoopy3476/Hostfile-mDNS/releases/download/v1.0/compose-global-hostfile.yml -o compose.yml \
      && docker compose up -d
    ```



## Configuration


- Format of hostfile (`hosts`)
  - Line format: `<target-ip> <domain-1.local> [domain-2.local] [domain-3.local] ...`
    - Multiple lines to the same IP is allowed
    - Invalid lines are ignored on scan
    - Comments are ignored (string after '#' characters)
    - E.g.)

      ```
      # line format: <target-ip> <src-domain-1.local> [src-domain-2.local] ...
      #   e.g.) 192.168.1.1  mdns-domain.local another-domain.local third-domain.local
      192.168.1.1    mdns-domain.local another-domain.local third-domain.local

      192.168.1.2    mdns-domain2.local     # comment
      192.168.1.2    mdns-domain3.local     # same ip with different domain, on different line
      ```
   - When file changed, `Hostfile-mDNS` will reload it right after the save


- Configurable container environment variables

  - `HMDNS_HOSTNAME`: Hostname to bind  
    (default: 0.0.0.0)
  - `HMDNS_PORT`: Port to bind (using TCP for syncing hostfile, and UDP for broadcasting mDNS)  
    (default: 5353)
  - `HMDNS_TTL`: Time-to-Live of domains in seconds  
    (default: 3600)
  - `HMDNS_PARENT_HOSTNAME`: Hostname of parent mDNS to sync hostfile.  
    Current mDNS server syncs its hostfile with the one from the parent server `HMDNS_PARENT_HOSTNAME`: disabled if `null`  
    (default: null)
  - `HMDNS_PARENT_PORT`: Port of parent mDNS to sync hostfile  
    (default: 5353)
  - `HMDNS_PARENT_SYNC_INTERVAL`: Interval in seconds to sync hostfile with parent mDNS  
    (default: 60)



## Remarks
- Run this image with network mode `host`, as mDNS multicast packets are not broadcasted beyond its container subnet!
