---
name: strava-training-analyst
description: Analyze Strava training data using the local strava-local CLI and provide coaching-style recommendations. Use this skill whenever the user asks about their rides, runs, training history, fitness trends, weekly volume, elevation, heart rate, power, cadence, pace, speed, fatigue, consistency, race preparation, recovery, or how to improve based on Strava activities. Trigger for questions like “how is my training going?”, “am I improving?”, “what should I do next week?”, “am I ready for this event?”, or “look at my Strava data”, even if the user does not explicitly ask for analysis.
---

# Strava Training Analyst

Use the local `strava-local` CLI to read Strava data and produce practical coaching-style analysis. This skill is read-only for Strava: inspect data, export local analysis files if useful, but never mutate Strava records.

## Safety boundaries

Allowed:

- Read athlete profile, activities, stats, zones, and selected activity streams.
- Write local JSON or Markdown reports under a user-approved local output path, preferably `strava-output/training/` when the user has not specified one.

Forbidden:

- Edit, delete, upload, rename, or change privacy/metadata for activities, routes, gear, or athlete profile.
- Use non-GET Strava API calls.
- Make medical diagnoses. If the user mentions injury, chest pain, dizziness, unusual fatigue, or health concerns, keep training advice conservative and recommend professional medical advice.

## First decide the analysis shape

Identify the user's actual question before fetching data:

- Recent training check: default to the last 4 weeks.
- Trend or fitness question: default to the last 8 to 12 weeks.
- Annual pattern: use year-to-date.
- Event prep: choose a window that shows current baseline, usually last 8 to 12 weeks, then relate it to the event date.
- Custom date range or sport: honor it.

Ask one concise clarifying question only if the missing detail would materially change the analysis, such as cycling vs running or a target event date. Otherwise choose a sensible default and state it.

## Data retrieval

Use the smallest useful date range first. Prefer normalized training commands because they produce stable fields for analysis:

```bash
strava-local training export --after YYYY-MM-DD --before YYYY-MM-DD --sport cycling --out activities-normalized.json
strava-local training weekly --after YYYY-MM-DD --before YYYY-MM-DD --from-file activities-normalized.json --out weekly.json
strava-local training summary --after YYYY-MM-DD --before YYYY-MM-DD --from-file activities-normalized.json --out summary.json
```

Useful variants:

```bash
strava-local training export --after YYYY-MM-DD --before YYYY-MM-DD --sport running --out activities-normalized.json
strava-local activities list --after YYYY-MM-DD --before YYYY-MM-DD --per-page 100 --all --out activities.json
strava-local activities get ACTIVITY_ID --out activity.json
strava-local activities streams ACTIVITY_ID --keys time,distance,altitude,velocity_smooth,heartrate,cadence,watts,temp --out streams.json
strava-local athlete stats --out stats.json
```

Fetch streams only when detail matters, such as a key workout, long ride/run, HR drift, power/cadence pattern, climb pacing, or anomaly check. Do not fetch streams for every activity unless the user explicitly asks for deep detail.

When the user asks about intensity, fatigue, endurance quality, climbing quality, whether rides were easy/hard, or readiness for an event, averages are not enough. Retrieve time-in-zone detail where available:

```bash
strava-local activities zones ACTIVITY_ID --out zones-ACTIVITY_ID.json
```

Use zone data before averages for intensity questions. Start with representative activities: the latest long ride/run, latest hard workout, one climb-focused session if relevant, and one clearly easy session. Expand to all relevant activities only when the date range is modest, usually 4 weeks or less, or when the user asks for detailed zone accounting. Report power zones and heart-rate zones separately, for example Z1/Z2/Z3/Z4/Z5 time and percentage. If zones are unavailable, say so and fall back to clearly labeled averages and sensor availability.

If `strava-local` is not on PATH, try the local dotfiles binary:

```bash
$DOTFILES/pi/skills/personal/strava-cli/strava-local whoami
```

## Optional helper script

This skill includes `scripts/training_report.py`. Use it when you have `summary.json` and optionally `weekly.json` and want a quick Markdown scaffold:

```bash
python3 /path/to/strava-training-analyst/scripts/training_report.py \
  --summary summary.json \
  --weekly weekly.json \
  --out report.md
```

The script is intentionally simple. Treat its output as a starting point, then add context, caveats, and recommendations tailored to the user's question.

For zone files exported with `activities zones`, use `scripts/zone_distribution.py` to aggregate heart-rate and power zone buckets:

```bash
python3 /path/to/strava-training-analyst/scripts/zone_distribution.py \
  zones-*.json \
  --out zone-summary.json \
  --markdown zone-summary.md
```

Include the zone table in the final report whenever it materially changes the answer. Time in zone is usually more useful than average HR or average power for judging training distribution, because averages can hide intervals, climbs, coasting, and recovery. If HR zones and power zones disagree, explain plausible reasons such as lag, fatigue, heat, climbs, coasting, or sensor differences instead of forcing one conclusion.

## Zone-first intensity analysis

When judging intensity distribution, use this order:

1. Check whether HR zones and power zones are available.
2. Aggregate time and percentage in each HR zone and power zone separately.
3. Treat averages as context only. They should not be the main evidence if zones exist.
4. Interpret distribution conservatively: lots of Z1/Z2 generally supports aerobic endurance, frequent Z4/Z5 or clustered hard days suggests more recovery or clearer easy days may be needed.
5. State exactly what is missing if zone data is partial.

## What to analyze

Use available fields without inventing precision:

- Volume: distance, moving time, activity count, active/rest days.
- Consistency: weekly frequency, gaps, irregular spikes.
- Endurance: longest ride/run progression and how it compares with weekly load.
- Climbing: elevation gain per week and per distance, climb-heavy sessions.
- Speed/pace: trends only after considering terrain, pauses, wind/weather, indoor vs outdoor, and route differences.
- Heart rate: availability, average/max trends, and time in HR zones when available. Prefer zone distribution over averages for intensity balance.
- Power: average/weighted power trends, time in power zones when available, hard-session clustering, and whether power is available consistently.
- Cadence: broad patterns and outliers, especially for cycling climbing or running form questions.
- Recovery: hard days stacked together, unusually high load jumps, lack of easy days.

## Coaching principles

Prefer practical and conservative guidance:

- Increase volume gradually. Flag large week-to-week jumps.
- Separate hard days with easy/recovery days.
- Build endurance with consistent aerobic volume and a progressive long ride/run.
- Use intervals sparingly and purposefully.
- Do not overinterpret one bad workout.
- Mention missing sensors, unavailable zones, indoor/outdoor differences, terrain, pauses, device changes, and weather as caveats.

For cycling, emphasize endurance volume, climbing load, power distribution, cadence patterns, long ride progression, and recovery between hard rides.

For running, emphasize weekly distance, long-run progression, pace/HR relationship, HR drift when streams are available, and intensity distribution.

## Default report format

```markdown
# Strava training analysis

## Executive summary

## What I looked at
- Date range:
- Activity types:
- Data available:

## Key trends

## Strengths

## Watch-outs

## Recommendations

## Suggested next week

## Caveats
```

For “what should I do next week?” or event-prep prompts, include a simple plan:

```markdown
## Suggested next week
| Day | Session | Purpose |
| --- | --- | --- |
```

Keep recommendations specific enough to act on, but not falsely precise. Tie every recommendation back to an observed pattern or a stated uncertainty.
