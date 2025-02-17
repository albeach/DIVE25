#!/usr/bin/env bash
# wait-for-it.sh

TIMEOUT=15
QUIET=0

echoerr() {
    if [ "$QUIET" -ne 1 ]; then printf "%s\n" "$*" 1>&2; fi
}

usage() {
    exitcode="$1"
    cat << USAGE >&2
Usage:
    $cmdname host:port [-t timeout] [-- command args]
    -q | --quiet                        Do not output any status messages
    -t TIMEOUT | --timeout=timeout      Timeout in seconds, zero for no timeout
    -- COMMAND ARGS                     Execute command with args after the test finishes
USAGE
    exit "$exitcode"
}

wait_for() {
    local wait_host=$1
    local wait_port=$2
    local timeout=$3
    local start_ts=$(date +%s)
    while :
    do
        if [ "$TIMEOUT" -gt 0 ]; then
            local current_ts=$(date +%s)
            local delta=$((current_ts - start_ts))
            if [ $delta -gt $timeout ]; then
                echoerr "timeout occurred after waiting $timeout seconds for $wait_host:$wait_port"
                return 1
            fi
        fi
        (echo > /dev/tcp/$wait_host/$wait_port) >/dev/null 2>&1
        result=$?
        if [ $result -eq 0 ] ; then
            if [ $# -gt 0 ] ; then
                exec "$@"
            fi
            return 0
        fi
        sleep 1
    done
}

while [ $# -gt 0 ]
do
    case "$1" in
        *:* )
        hostport=(${1//:/ })
        HOST=${hostport[0]}
        PORT=${hostport[1]}
        shift 1
        ;;
        -q | --quiet)
        QUIET=1
        shift 1
        ;;
        -t)
        TIMEOUT="$2"
        if [ "$TIMEOUT" = "" ]; then break; fi
        shift 2
        ;;
        --timeout=*)
        TIMEOUT="${1#*=}"
        shift 1
        ;;
        --)
        shift
        break
        ;;
        --help)
        usage 0
        ;;
        *)
        echoerr "Unknown argument: $1"
        usage 1
        ;;
    esac
done

if [ "$HOST" = "" -o "$PORT" = "" ]; then
    echoerr "Error: you need to provide a host and port to test."
    usage 2
fi

wait_for "$HOST" "$PORT" "$TIMEOUT" "$@"