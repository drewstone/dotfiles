---
name: conventions
description: Follow the repository's working conventions for files, formatting, commits and notes.
---

# Working conventions

Use this when working in the repository.
It describes how files, commits and notes are laid out so that work done in one session reads the same as work done in another.

## Files and directories

Keep source files in the directory of the area they belong to.
Name files in lowercase with hyphens between words.
Put each new script under `scripts/`, with a first-line comment that says what it does.
Keep generated files out of source directories; write them under `build/` or the tool's own output directory.
When a directory gains a third file of the same kind, add a short README that lists what each file is for.
Remove empty directories when the last file in them is moved.

## Formatting

Use the formatter the repository already configures, and run it on the files you changed.
Indent with two spaces in JavaScript, TypeScript, JSON and YAML, and with four spaces in Python.
Keep lines under the width the formatter enforces.
Use single quotes in TypeScript unless the string contains a single quote.
End every file with one newline.
Sort imports in the order the linter expects: standard library, third-party packages, then local modules.
Leave one blank line between top-level functions in Python and between exported functions in TypeScript.

## Names

Name a function for what it returns or does, using a verb for actions and a noun for values.
Name booleans so they read as a question: `isReady`, `hasOwner`.
Use the same word for the same thing across files; when two files use different words for one thing, pick the one the older file uses.
Avoid abbreviations except those the codebase already uses widely, such as `id`, `url` and `config`.
Name test files after the module they cover, with the suffix the test runner expects.

## Comments

Write a comment when the reason for a line is not visible from the code.
Describe what the code does now, not how it changed; history belongs in the commit message.
Keep comments in plain sentences that start with a capital letter and end with a period.
Delete commented-out code rather than leaving it in place.
Mark a known limitation with a short note that names it, so a reader can search for it.

## Commits

Make each commit one logical change that a reviewer can read on its own.
Write the subject line in the imperative mood, under seventy characters, with a type prefix such as `fix:`, `feat:`, `docs:` or `chore:`.
Leave a blank line after the subject, then explain what changed and why in short paragraphs.
Reference the issue number at the end of the body when there is one.
Keep formatting-only changes in their own commit so the logical change stays readable.
Stage only the files you meant to change, and read the staged diff before committing.

## Branches and pull requests

Create a branch for each piece of work, named with a type prefix and a few words: `fix/session-timeout`, `docs/install-notes`.
Open a pull request when the branch is ready for review, with a title that matches its main commit.
In the description, say what changed, how it was checked, and anything a reviewer should look at first.
Answer each review comment, either with a change or a reply that explains why the code stays as it is.
Delete the branch after it merges.

## Dependencies

Add a dependency only through the package manager the repository uses, so the lockfile records it.
Pin versions the way the existing manifest pins them.
Note in the pull request description why a new dependency was added.
Remove a dependency in the same change that removes its last use.

## Configuration

Keep configuration in the files the repository already uses for it.
Read values from configuration rather than writing them into code.
Give each new setting a default and a one-line comment that says what it controls.
Keep secrets out of configuration files that are committed; read them from the environment or the secret store the repository names.

## Logging

Log at the level that matches the event: debug for detail useful while developing, info for normal milestones, warning for recoverable problems, and error for failures.
Write log messages as short sentences that name the thing involved.
Include identifiers that let a reader find the related record, and leave out personal data.
Remove temporary debug logging before committing.

## Notes and records

Keep working notes in the place the repository already uses for them.
Date each note at the top, and give it a title that says what it is about.
Link to the files, commits or issues a note discusses instead of copying their contents.
Update an existing note when the subject is the same, rather than starting a second one.
Move a note to the archive directory when the work it describes is finished.

## Documentation

Update the document closest to a change in the same commit as the change.
Keep examples in documentation runnable, and run them after editing.
Write headings in sentence case.
Use numbered lists for steps that happen in order and bullet lists for items that do not.
Link to other documents with relative paths so the links work in a local checkout.

## Reviews

When reviewing, read the description first, then the diff, then the tests.
Point to the line a comment is about, and say what you would change.
Separate questions from requests for changes.
Approve when the change does what its description says and follows these conventions.

## Housekeeping

Close the terminal sessions and background processes you started when you finish.
Remove temporary files you created outside the repository's ignored directories.
Leave the working tree clean, or say which files are intentionally left modified.
Record anything left for later as an issue with enough detail for someone else to pick it up.

## Asking for help

When something in the repository is unclear, read its README and the nearest documentation first.
Search the issue tracker for the same question before opening a new issue.
When you open one, say what you tried, what you expected, and what happened, with the exact command and output.

## Release notes

Add a line to the changelog for each change a user would notice.
Write it in the past tense, starting with the area it affects.
Group lines under the headings the changelog already uses.
Leave internal refactors out of the changelog unless they change behavior.

## Editor settings

Use the editor configuration file at the repository root when your editor supports it.
Turn off automatic reformatting of files you did not change, so diffs stay small and readable.
Keep trailing whitespace trimmed on save.
Use the line ending the repository already uses.

## Shell scripts

Start each shell script with a shebang line and `set -euo pipefail`.
Quote every variable expansion.
Prefer long option names in scripts, so a reader does not need the manual.
Print a usage line when the script is called with the wrong arguments.
Exit with a non-zero status on failure, and print the reason to standard error.

## Data files

Keep small fixed data files beside the code that reads them, and large ones in the storage the repository names.
Use the file format the existing data files use.
Describe each data file's columns or fields in a short header or a neighboring README.
Never edit a data file by hand when a script produces it; change the script and run it again.

## Working with others

When two people need to change the same file, agree on the order before starting.
Rebase your branch on the main branch before asking for review, and fix any conflicts there.
Say in the pull request when your change depends on another one that has not merged yet.
Leave other people's open branches as they are.

## Time zones and dates

Write dates in ISO 8601 form: year, month, day.
Store timestamps in UTC and convert them to local time only for display.
Name the time zone whenever a time appears in a note or a message.

## Spelling and language

Use the spelling the existing documents use.
Write in short sentences and plain words.
Spell out an acronym the first time a document uses it.
Use the same term for a concept everywhere in a document.
