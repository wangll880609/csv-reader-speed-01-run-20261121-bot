# csv-reader-speed-01-run-20261121-bot

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/wangll880609/csv-reader-speed-01-run-20261121-bot/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/wangll880609/csv-reader-speed-01-run-20261121-bot/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

Fast drop-in for csv-reader 1.0.0: `solve.js` answers exactly as the reference on
every case (BOM, quoted fields, CRLF/lone CR, stray CRs, short/long rows, quote
junk, unterminated quotes), and runs about 5x faster than the reference on the
practice set (median CPU ~0.14 s vs ~0.69 s per 6-case set). The reader jumps with
`indexOf`/`slice` instead of walking one character at a time: a record with no
quote before its line end is split in one `split(',')` call, an unquoted field is
one slice, and a quoted field jumps from quote to quote. Stray CRs, doubled
quotes and quoted line breaks take a slow path that runs only where they occur.

## Run it

```sh
MAKEFUN_INPUT_DIR=<dir with cases.json> MAKEFUN_OUTPUT_DIR=<out dir> node main.ts
```

`main.ts` (Node 22, type-stripped) reads every case from `/input/cases.json`,
answers each with `run` from `solve.js`, and writes `/output/answers.json`.
No dependencies, no network, no WebAssembly, deterministic: two runs write
byte-identical output.

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=2459v11p&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
