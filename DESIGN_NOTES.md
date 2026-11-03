# Design notes

Optional extensions and trade-offs beyond the three challenge parts.

## Indexed daily usage

`createDailyUsageIndex` sorts a copy of the events, preserves input order for matching timestamps, and precomputes all 365 daily totals. Building the index takes O(n log n + d) time and O(n + d) space for n events and d days; each subsequent day lookup takes O(1).

`calculateEnergyUsageForDaySorted` caches that index in a `WeakMap` keyed by profile object. The first query builds the index; subsequent queries for that same object reuse it. Profiles and their events must be treated as immutable: pass a new profile object when data changes. The cached totals are a snapshot and do not track in-place mutations. Cache entries can be collected when the profile is no longer retained.

For a single query on chronological data, `calculateEnergyUsageForDay` avoids sorting and computing totals for every day.

## Streaming thoughts and trade-offs

The batch APIs can sort a complete profile before calculating usage. A stream
cannot as an event for 10:00 might arrive after one for 10:05. Since each event
defines the state of the interval after it, accepting the late event can
change both the appliance state and the usage total up to the next event. Bad!

The practical choice is whether the product prefers final answers later or
fast answers that might need correcting. Two possible ideas are...

1. Wait for confidence with a watermark
   I.e. Keep a timestamp-ordered buffer for each appliance. Process an event only
   when it is older than a configured lateness allowance behind the newest
   event seen. With a five-minute allowance, events older than five minutes
   can be treated as ordered and their totals as final. This is a good fit
   for billing or compliance, where corrections are expensive. The cost is
   delayed results, buffered memory + explicit policy for events that
   arrive after the window closes (that is, reject, quarantine, or correct them)

   ```text
   onEvent(applianceId, event):
     1. ignore event if its ID was already seen
     2. insert event into appliance buffer by timestamp, then sequence
     3. latestSeen = max(latestSeen, event.timestamp)
     4. watermark = latestSeen - allowedLateness
     5. while oldest buffered event.timestamp <= watermark:
          apply event and publish its final affected usage interval
   ```

2. Publish immediately, then correct late data
   Apply each event as it arrives and label calculated totals as provisional.
   Retain ordered event history, or periodic state and usage checkpoints, so
   a late event can be inserted and only the affected interval replayed.
   Publish the correction as a versioned upsert or compensating update. This
   suits interactive dashboards because it favours low latency, but clients
   must understand that a previously displayed total can change.

   ```text
   onEvent(applianceId, event):
     1. ignore event if its ID was already seen
     2. insert event into retained history by timestamp, then sequence
     3. checkpoint = latest saved state at or before event.timestamp
     4. replay history from checkpoint through the affected usage window
     5. save updated state and publish a versioned correction
   ```

Either way, it needs a stable tie-breaker for equal timestamps, an event ID
for idempotent deduplication, validation before buffering, and separate
state and buffers per appliance ID. The lateness allowance and correction
contract should be explicit API behaviour, never an accidental consequence
of arrival order.

## Possible TypeScript types

If this were all to be converted to TypeScript...

```ts
type UsageState = 'on' | 'off';
type SavingsState = UsageState | 'auto-off';

interface StateChange<TState extends string> {
  state: TState;
  timestamp: number;
}

interface UsageProfile<TState extends string> {
  initial: TState;
  events: StateChange<TState>[];
}

type DailyUsageProfile = UsageProfile<UsageState>;
type SavingsProfile = UsageProfile<SavingsState>;
type MonthlyUsageProfile = UsageProfile<UsageState>;
```
