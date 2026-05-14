# Worker Package Standards

## Startup

- All logic in `async function main()` with top-level `.catch()` that logs and exits
- No module-level side effects — Redis, BullMQ, heartbeat all created inside `main()`
- Verify Redis connectivity (`await redis.ping()`) before starting work

## Heartbeat

- Redis writes: `.catch()` with logging if fire-and-forget
- Tests: `vi.useFakeTimers()` for interval continuation and `stopHeartbeat` cleanup
- Test both success and Redis rejection paths

## Shutdown

- `redis.quit()` not `disconnect()`. BullMQ `worker.close()` before Redis close
- Log each cleanup step

## Redis

- `redis.on('error')` immediately after instantiation
- Connection options from env vars inside `main()`, not module scope
