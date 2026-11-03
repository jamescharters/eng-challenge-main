/* The maximum number of minutes in a period (a day) */

const MAX_IN_PERIOD = 1440;
const DAYS_IN_YEAR = 365; // technically, its 365.25, but we ignore leap years for simplicity
const MAX_IN_MONTH = DAYS_IN_YEAR * MAX_IN_PERIOD;
const USAGE_STATES = ['on', 'off'];
const SAVINGS_STATES = [...USAGE_STATES, 'auto-off'];

// JC: added helper function
const validateUsageProfile = (
  profile,
  periodLength,
  allowedStates,
  requireChronological = false
) => {
  if (!Array.isArray(profile?.events)) {
    throw new Error('events must be an array');
  }

  // Unknown states would otherwise be counted as off without warning.
  if (!allowedStates.includes(profile.initial)) {
    throw new Error('invalid state');
  }

  let previousTimestamp = -1;

  for (const event of profile.events) {
    if (!allowedStates.includes(event.state)) {
      throw new Error('invalid state');
    }

    if (
      !Number.isFinite(event.timestamp) ||
      !Number.isInteger(event.timestamp)
    ) {
      throw new Error('timestamp must be a finite integer');
    }
    if (event.timestamp < 0 || event.timestamp >= periodLength) {
      throw new Error('timestamp out of range');
    }

    // Original calculators require chronological events; use
    // calculateEnergyUsageForDaySorted for unordered batches.
    if (requireChronological && event.timestamp < previousTimestamp) {
      throw new Error('events must be chronological');
    }

    previousTimestamp = event.timestamp;
  }
};

/**
 * PART 1
 *
 * You have an appliance that uses energy, and you want to calculate how
 * much energy it uses over a period of time.
 *
 * As an input to your calculations, you have a series of events that contain
 * a timestamp and the new state (on or off). You are also given the initial
 * state of the appliance. From this information, you will need to calculate
 * the energy use of the appliance i.e. the amount of time it is switched on.
 *
 * The amount of energy it uses is measured in 1-minute intervals over the
 * period of a day. Given there is 1440 minutes in a day (24 * 60), if the
 * appliance was switched on the entire time, its energy usage would be 1440.
 * To simplify calculations, timestamps range from 0 (beginning of the day)
 * to 1439 (last minute of the day).
 *
 * HINT: there is an additional complication with the last two tests that
 * introduce spurious state change events (duplicates at different time periods).
 * Focus on getting these tests working after satisfying the first tests.
 *
 * The structure for `profile` looks like this (as an example):
 * ```
 * {
 *    initial: 'on',
 *    events: [
 *      { state: 'off', timestamp: 50 },
 *      { state: 'on', timestamp: 304 },
 *      { state: 'off', timestamp: 600 },
 *    ]
 * }
 * ```
 */

/**
 * Calculates the number of minutes an appliance is on during one day.
 * Events must be chronological; each event state applies to the interval after it.
 *
 * @param {{initial: string, events: Array<{state: string, timestamp: number}>}} profile
 *   The initial appliance state and its daily state-change events.
 * @returns {number} The total on-time in minutes.
 * @throws {Error} If the profile has invalid states, timestamps, or event order.
 */
const calculateEnergyUsageSimple = (profile) => {
  validateUsageProfile(profile, MAX_IN_PERIOD, USAGE_STATES, true);

  let currentState = profile.initial;
  let totalEnergyUsage = 0;
  let latestTimestamp = 0;

  // TODO: TypeScript could add safety around values such as profile.
  // TODO: what about negative timestamps? or absurdly large?
  // TODO: what about multiple appliances / accounts etc
  // TODO: what about different usage quantities (kWh?) per time interval?

  for (const event of profile.events) {
    if (currentState === 'on') {
      totalEnergyUsage += event.timestamp - latestTimestamp;
    }

    currentState = event.state;
    latestTimestamp = event.timestamp;
  }

  // What if the final event is still 'on'? Then we add the time difference between
  // last timestamp in the event list and end of the day constant
  if (currentState === 'on') {
    totalEnergyUsage += MAX_IN_PERIOD - latestTimestamp;
  }

  return totalEnergyUsage;
};

/**
 * PART 2
 *
 * You purchase an energy-saving device for your appliance in order
 * to cut back on its energy usage. The device is smart enough to shut
 * off the appliance after it detects some period of disuse, but you
 * can still switch on or off the appliance as needed.
 *
 * You are keen to find out if your shiny new device was a worthwhile
 * purchase. Its success is measured by calculating the amount of
 * energy *saved* by device.
 *
 * To assist you, you now have a new event type that indicates
 * when the appliance was switched off by the device (as opposed to switched
 * off manually). Your new states are:
 * * 'on'
 * * 'off' (manual switch off)
 * * 'auto-off' (device automatic switch off)
 *
 * (The `profile` structure is the same, except for the new possible
 * value for `initial` and `state`.)
 *
 * Write a function that calculates the *energy savings* due to the
 * periods of time when the device switched off your appliance. You
 * should not include energy saved due to manual switch offs.
 *
 * You will need to account for redundant/non-sensical events e.g.
 * an off event after an auto-off event, which should still count as
 * an energy savings because the original trigger was the device
 * and not manual intervention.
 */

/**
 * Calculates the minutes saved by automatic appliance shutdowns during one day.
 * Only intervals following an auto-off event count; redundant manual-off events
 * do not end an active automatic shutdown.
 *
 * @param {{initial: string, events: Array<{state: string, timestamp: number}>}} profile
 *   The initial appliance state and chronological daily state-change events.
 * @returns {number} The total automatically saved time in minutes.
 * @throws {Error} If the profile has invalid states, timestamps, or event order.
 */
const calculateEnergySavings = (profile) => {
  validateUsageProfile(profile, MAX_IN_PERIOD, SAVINGS_STATES, true);

  let currentState = profile.initial;
  let totalEnergySaved = 0;
  let currentTimestamp = 0;

  for (const event of profile.events) {
    if (currentState === 'auto-off') {
      totalEnergySaved += event.timestamp - currentTimestamp;
    }

    if (!(currentState === 'auto-off' && event.state === 'off')) {
      currentState = event.state;
    }

    currentTimestamp = event.timestamp;
  }

  if (currentState === 'auto-off') {
    totalEnergySaved += MAX_IN_PERIOD - currentTimestamp;
  }

  return totalEnergySaved;
};

/**
 * PART 3
 *
 * The process of producing metrics usually requires handling multiple days of data. The
 * examples so far have produced a calculation assuming the day starts at '0' for a single day.
 *
 * In this exercise, the timestamp field contains the number of minutes since a
 * arbitrary point in time (the "Epoch"). To simplify calculations, assume:
 *  - the Epoch starts at the beginning of the month (i.e. midnight on day 1 is timestamp 0)
 *  - our calendar simply has uniform length 'days' - the first day is '1' and the last day is '365'
 *  - the usage profile data will not extend more than one month
 *
 * Your function should calculate the energy usage over a particular day, given that
 * day's number. It will have access to the usage profile over the month.
 *
 * It should also throw an error if the day value is invalid i.e. if it is out of range
 * or not an integer. Specific error messages are expected - see the tests for details.
 *
 * (The `profile` structure is the same as part 1, but remember that timestamps now extend
 * over multiple days)
 *
 * HINT: You are encouraged to re-use `calculateEnergyUsageSimple` from PART 1 by
 * constructing a usage profile for that day by slicing up and rewriting up the usage profile you have
 * been given for the month.
 */

const isInteger = (number) => Number.isInteger(number);

// JC: helper function to declutter
const validateDay = (day) => {
  if (!isInteger(day)) {
    throw new Error('must be an integer');
  }

  if (day < 1 || day > DAYS_IN_YEAR) {
    throw new Error('day out of range');
  }
};

/**
 * Calculates the number of minutes an appliance is on during a requested day.
 * Events before that day establish its initial state; in-day events are rebased
 * to daily timestamps before the Part 1 calculator is used.
 *
 * @param {{initial: string, events: Array<{state: string, timestamp: number}>}} monthUsageProfile
 *   The initial appliance state and chronological state-change events for a month.
 * @param {number} day The one-based day number, from 1 through 365.
 * @returns {number} The requested day's total on-time in minutes.
 * @throws {Error} If the day or monthly profile is invalid.
 */
const calculateEnergyUsageForDay = (monthUsageProfile, day) => {
  validateDay(day);
  validateUsageProfile(monthUsageProfile, MAX_IN_MONTH, USAGE_STATES, true);

  const startOfTargetDay = (day - 1) * MAX_IN_PERIOD;
  const endOfTargetDay = day * MAX_IN_PERIOD;
  let initialState = monthUsageProfile.initial;

  for (const event of monthUsageProfile.events) {
    if (event.timestamp < startOfTargetDay) {
      initialState = event.state;
    } else {
      break;
    }
  }

  const dayUsageProfile = {
    initial: initialState,
    events: monthUsageProfile.events
      .filter(
        (event) =>
          event.timestamp >= startOfTargetDay &&
          event.timestamp < endOfTargetDay
      )
      .map((event) => ({
        ...event,
        timestamp: event.timestamp - startOfTargetDay,
      })),
  };

  return calculateEnergyUsageSimple(dayUsageProfile);
};

/**
 * PART 4: JC playground experiments with ordered and indexed daily usage variantsaa
 */

// Sort chronologically without mutating the caller's events. When timestamps
// match, preserve their original order because that order defines later state.
const sortEventsByTimestamp = (events) => {
  const originalEvents = events.map((event, originalIndex) => ({
    event,
    originalIndex,
  }));

  originalEvents.sort((left, right) => {
    const diff = left.event.timestamp - right.event.timestamp;
    return diff || left.originalIndex - right.originalIndex;
  });

  return originalEvents.map(({ event }) => event);
};

// Another optimisation to precompute daily usage for all days in the month.
// This allows O(1) retrieval for any day, which is useful when multiple queries
// for different days are expected. It trades memory for speed by storing the
// usage for all 365 days upfront, which may be less than ideal in some cases.
const createDailyUsageIndex = (monthUsageProfile) => {
  validateUsageProfile(monthUsageProfile, MAX_IN_MONTH, USAGE_STATES);

  const sortedEvents = sortEventsByTimestamp(monthUsageProfile.events);
  const dailyUsage = [];
  let currentState = monthUsageProfile.initial;
  let eventIndex = 0;

  for (let day = 1; day <= DAYS_IN_YEAR; day += 1) {
    const startOfDay = (day - 1) * MAX_IN_PERIOD;
    const endOfDay = day * MAX_IN_PERIOD;
    const dayEvents = [];
    const initialStateForDay = currentState;

    while (
      eventIndex < sortedEvents.length &&
      sortedEvents[eventIndex].timestamp < endOfDay
    ) {
      const event = sortedEvents[eventIndex];

      if (event.timestamp >= startOfDay) {
        dayEvents.push({
          ...event,
          timestamp: event.timestamp - startOfDay,
        });
      }

      currentState = event.state;
      eventIndex += 1;
    }

    dailyUsage.push(
      calculateEnergyUsageSimple({
        initial: initialStateForDay,
        events: dayEvents,
      })
    );
  }

  return {
    getEnergyUsageForDay(day) {
      validateDay(day);
      return dailyUsage[day - 1];
    },
  };
};

const dailyUsageIndexes = new WeakMap();

// The first query validates, sorts, and indexes the profile. Later queries for
// the same profile object reuse its snapshot for O(1) retrieval. Treat profiles
// and their events as immutable: pass a new profile object when data changes.
// WeakMap entries can be collected when callers no longer retain the profile.
const calculateEnergyUsageForDaySorted = (monthUsageProfile, day) => {
  validateDay(day);

  let dailyUsageIndex = dailyUsageIndexes.get(monthUsageProfile);
  if (!dailyUsageIndex) {
    dailyUsageIndex = createDailyUsageIndex(monthUsageProfile);
    dailyUsageIndexes.set(monthUsageProfile, dailyUsageIndex);
  }

  return dailyUsageIndex.getEnergyUsageForDay(day);
};

/**
 * PART 5: Streaming thoughts and trade-offs
 *
 * The batch APIs can sort a complete profile before calculating usage. A stream
 * cannot as an event for 10:00 might arrive after one for 10:05. Since each event
 * defines the state of the interval after it, accepting the late event can
 * change both the appliance state and the usage total up to the next event. Bad!
 *
 * The practical choice is whether the product prefers final answers later or
 * fast answers that might need correcting. Two possible ideas are...
 *
 * 1. Wait for confidence with a watermark
 *    I.e. Keep a timestamp-ordered buffer for each appliance. Process an event only
 *    when it is older than a configured lateness allowance behind the newest
 *    event seen. With a five-minute allowance, events older than five minutes
 *    can be treated as ordered and their totals as final. This is a good fit
 *    for billing or compliance, where corrections are expensive. The cost is
 *    delayed results, buffered memory + explicit policy for events that
 *    arrive after the window closes (that is, reject, quarantine, or correct them)
 *
 *    EXAMPLE
 *    Pseudocode:
 *      onEvent(applianceId, event):
 *        1. ignore event if its ID was already seen
 *        2. insert event into appliance buffer by timestamp, then sequence
 *        3. latestSeen = max(latestSeen, event.timestamp)
 *        4. watermark = latestSeen - allowedLateness
 *        5. while oldest buffered event.timestamp <= watermark:
 *             apply event and publish its final affected usage interval
 *
 * 2. Publish immediately, then correct late data
 *    Apply each event as it arrives and label calculated totals as provisional.
 *    Retain ordered event history, or periodic state and usage checkpoints, so
 *    a late event can be inserted and only the affected interval replayed.
 *    Publish the correction as a versioned upsert or compensating update. This
 *    suits interactive dashboards because it favours low latency, but clients
 *    must understand that a previously displayed total can change.
 *
 *    pseudocode:
 *      onEvent(applianceId, event):
 *        1. ignore event if its ID was already seen
 *        2. insert event into retained history by timestamp, then sequence
 *        3. checkpoint = latest saved state at or before event.timestamp
 *        4. replay history from checkpoint through the affected usage window
 *        5. save updated state and publish a versioned correction
 *
 * Either way, it needs a stable tie-breaker for equal timestamps, an event ID
 * for idempotent deduplication, validation before buffering, and separate
 * state and buffers per appliance ID. The lateness allowance and correction
 * contract should be explicit API behaviour, never an accidental consequence
 * of arrival order.
 */

/**
 * PART 6: Possible TypeScript types
 *
 * If this were all to be converted to TypeScript...
 *
 * ```ts
 * type UsageState = 'on' | 'off';
 * type SavingsState = UsageState | 'auto-off';
 *
 * interface StateChange<TState extends string> {
 *   state: TState;
 *   timestamp: number;
 * }
 *
 * interface UsageProfile<TState extends string> {
 *   initial: TState;
 *   events: StateChange<TState>[];
 * }
 *
 * type DailyUsageProfile = UsageProfile<UsageState>;
 * type SavingsProfile = UsageProfile<SavingsState>;
 * type MonthlyUsageProfile = UsageProfile<UsageState>;
 * ```
 */

module.exports = {
  calculateEnergyUsageSimple,
  calculateEnergySavings,
  calculateEnergyUsageForDay,
  calculateEnergyUsageForDaySorted,
  createDailyUsageIndex,
  MAX_IN_PERIOD,
};
