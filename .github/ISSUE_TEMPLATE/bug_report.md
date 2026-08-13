name: Bug Report
description: Create a report to help us fix a bug
title: "[BUG]: "
labels: ["bug", "triage-needed"]
body:
  - type: textarea
    id: description
    attributes:
      label: Bug Description
      description: A clear description of what the bug is.
    validations:
      required: true
  - type: textarea
    id: reproduction
    attributes:
      label: Steps to Reproduce
      description: Detailed steps to reproduce the issue.
    validations:
      required: true
