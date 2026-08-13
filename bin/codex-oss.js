#!/usr/bin/env node

import { createProgram } from '../dist/cli/index.js';

const program = createProgram();
program.parse(process.argv);
