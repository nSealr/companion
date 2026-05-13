# @nsealr/framing

Checksum-protected serial frame helpers for USB CDC and UART experiments.

## Purpose

- Encode and decode nSealr serial line frames.
- Enforce shared serial-frame byte limits.
- Reject checksum mismatches and malformed payloads deterministically.

## Boundary

This package only frames bytes for transport. It does not open devices, select
routes, store keys, or sign events.

