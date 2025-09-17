\# AI Agents Architecture



\## Overview

This repository uses multi-stage AI agents to analyze and refactor commission logic code to comply with `/rules/commission-rules.json`.  

Each agent has a strict single purpose and must fail fast if rules are broken.



\## Agents



\### ReaderAgent

\- Parses JavaScript files into AST

\- Extracts functions, data flow, side effects



\### AuditorAgent

\- Compares code logic against the rules JSON

\- Flags missing purchaseType branching, incentive overrides, tier selection, and bonus application



\### RefactorAgent

\- Fixes violations while preserving logic

\- Must output `.refactored.js` files for diff review



\### VerifierAgent

\- Runs Reader + Auditor again on refactored code

\- Passes only if logic matches and all rules are satisfied



\## Rules

\- Defined in `/rules/commission-rules.json`

\- Commission = base tier rate or incentive override, plus state bonus after totals

\- purchaseType is given as 'new' or 'repeat' (already precomputed upstream)



\## Workflow

Reader → Auditor → Refactor → Verifier  

Fails stop the pipeline and require human review



