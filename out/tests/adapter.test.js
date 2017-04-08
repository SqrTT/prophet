/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var assert = require("assert");
var Path = require("path");
var vscode_debugadapter_testsupport_1 = require("vscode-debugadapter-testsupport");
suite('Node Debug Adapter', function () {
    var DEBUG_ADAPTER = './out/mockDebug.js';
    var PROJECT_ROOT = Path.join(__dirname, '../../');
    var DATA_ROOT = Path.join(PROJECT_ROOT, 'src/tests/data/');
    var dc;
    setup(function () {
        dc = new vscode_debugadapter_testsupport_1.DebugClient('node', DEBUG_ADAPTER, 'mock');
        return dc.start();
    });
    teardown(function () { return dc.stop(); });
    suite('basic', function () {
        test('unknown request should produce error', function (done) {
            dc.send('illegal_request').then(function () {
                done(new Error("does not report error on unknown request"));
            }).catch(function () {
                done();
            });
        });
    });
    suite('initialize', function () {
        test('should return supported features', function () {
            return dc.initializeRequest().then(function (response) {
                assert.equal(response.body.supportsConfigurationDoneRequest, true);
            });
        });
        test('should produce error for invalid \'pathFormat\'', function (done) {
            dc.initializeRequest({
                adapterID: 'mock',
                linesStartAt1: true,
                columnsStartAt1: true,
                pathFormat: 'url'
            }).then(function (response) {
                done(new Error("does not report error on invalid 'pathFormat' attribute"));
            }).catch(function (err) {
                // error expected
                done();
            });
        });
    });
    suite('launch', function () {
        test('should run program to the end', function () {
            var PROGRAM = Path.join(DATA_ROOT, 'test.md');
            return Promise.all([
                dc.configurationSequence(),
                dc.launch({ program: PROGRAM }),
                dc.waitForEvent('terminated')
            ]);
        });
        test('should stop on entry', function () {
            var PROGRAM = Path.join(DATA_ROOT, 'test.md');
            var ENTRY_LINE = 1;
            return Promise.all([
                dc.configurationSequence(),
                dc.launch({ program: PROGRAM, stopOnEntry: true }),
                dc.assertStoppedLocation('entry', { line: ENTRY_LINE })
            ]);
        });
    });
    suite('setBreakpoints', function () {
        test('should stop on a breakpoint', function () {
            var PROGRAM = Path.join(DATA_ROOT, 'test.md');
            var BREAKPOINT_LINE = 2;
            return dc.hitBreakpoint({ program: PROGRAM }, { path: PROGRAM, line: BREAKPOINT_LINE });
        });
        test('hitting a lazy breakpoint should send a breakpoint event', function () {
            var PROGRAM = Path.join(DATA_ROOT, 'testLazyBreakpoint.md');
            var BREAKPOINT_LINE = 3;
            return Promise.all([
                dc.hitBreakpoint({ program: PROGRAM }, { path: PROGRAM, line: BREAKPOINT_LINE, verified: false }),
                dc.waitForEvent('breakpoint').then(function (event) {
                    assert.equal(event.body.breakpoint.verified, true, "event mismatch: verified");
                })
            ]);
        });
    });
    suite('setExceptionBreakpoints', function () {
        test('should stop on an exception', function () {
            var PROGRAM_WITH_EXCEPTION = Path.join(DATA_ROOT, 'testWithException.md');
            var EXCEPTION_LINE = 4;
            return Promise.all([
                dc.waitForEvent('initialized').then(function (event) {
                    return dc.setExceptionBreakpointsRequest({
                        filters: ['all']
                    });
                }).then(function (response) {
                    return dc.configurationDoneRequest();
                }),
                dc.launch({ program: PROGRAM_WITH_EXCEPTION }),
                dc.assertStoppedLocation('exception', { line: EXCEPTION_LINE })
            ]);
        });
    });
});
//# sourceMappingURL=adapter.test.js.map