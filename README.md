# Irrigation

A system for building a dynamic reverse HTTP proxy system.

## Usage

See the `delta.js` file for usage.  Or checkout the `test` directory.

## Life Cycle

This project is still young and in a state of flex.  Please help out with documentation, new ideas, and just being
awesome.

## Changelog

### Next

*DevXP*
* Tests can now be co-located with the subject under test.  This will move `test` from being a junk drawer of unit tests
to being test specific support code.  Hopefully this will make it easier to write tests.  Any file matching `*.units.js` 
will be run in the *unit testing* phase, while the `*.integ.js` files will be run during the integration testing phase.