#!/usr/bin/env node
import { main } from "./cli.js"

const code = await main()
process.exit(code)
