import * as path from 'path';
import { strict as A } from 'assert';
import mock = require('mock-require');
import { BenchmarkResult } from '../src/extract';

const dummyWebhookPayload = {
    // eslint-disable-next-line @typescript-eslint/camelcase
    head_commit: {
        id: '123456789abcdef',
        message: 'this is dummy',
        timestamp: 'dummy timestamp',
        url: 'https://github.com/dummy/repo',
    },
} as { [key: string]: any };
const dummyGitHubContext = {
    payload: dummyWebhookPayload,
};

mock('@actions/github', { context: dummyGitHubContext });

const { extractResult } = require('../src/extract');

describe('extractResult()', function() {
    after(function() {
        mock.stop('@actions/github');
    });

    afterEach(function() {
        dummyGitHubContext.payload = dummyWebhookPayload;
    });

    const normalCases: Array<{
        expected: BenchmarkResult[];
        file?: string;
    }> = [
        {
            expected: [
                {
                    name: 'bench.py::test_fib_10',
                    range: 'stddev: 0.000006175090189861328',
                    unit: 'iter/sec',
                    value: 41513.272817492856,
                    extra: 'mean: 24.08868133322941 usec\nrounds: 38523',
                },
                {
                    name: 'bench.py::test_fib_20',
                    range: 'stddev: 0.0001745301654140968',
                    unit: 'iter/sec',
                    value: 335.0049328331567,
                    extra: 'mean: 2.9850306726618627 msec\nrounds: 278',
                },
            ],
        },
        {
            file: 'pytest_several_units.json',
            expected: [
                {
                    extra: 'mean: 149.95610248628836 nsec\nrounds: 68536',
                    name: 'bench.py::test_fib_1',
                    range: 'stddev: 2.9351731952139377e-8',
                    unit: 'iter/sec',
                    value: 6668618.238403659,
                },
                {
                    name: 'bench.py::test_fib_10',
                    range: 'stddev: 0.000005235937482008476',
                    unit: 'iter/sec',
                    value: 34652.98828915334,
                    extra: 'mean: 28.85754012484424 usec\nrounds: 20025',
                },
                {
                    name: 'bench.py::test_fib_20',
                    range: 'stddev: 0.0003737982822178215',
                    unit: 'iter/sec',
                    value: 276.8613383807958,
                    extra: 'mean: 3.611916368852473 msec\nrounds: 122',
                },
                {
                    extra: 'mean: 2.0038430469999997 sec\nrounds: 5',
                    name: 'bench.py::test_sleep_2',
                    range: 'stddev: 0.0018776587251587858',
                    unit: 'iter/sec',
                    value: 0.49904108083570886,
                },
            ],
        },
    ];

    for (const test of normalCases) {
        it(`extracts benchmark output for ${test.file ?? `pytest_output.txt`}`, async function() {
            const file = test.file ?? `pytest_output.txt`;
            const outputFilePath = path.join(__dirname, 'data', 'extract', file);
            const config = {
                outputFilePath,
            };
            const bench = await extractResult(config);

            A.equal(bench.commit, dummyWebhookPayload.head_commit);
            A.ok(bench.date <= Date.now(), bench.date.toString());
            A.deepEqual(test.expected, bench.benches);
        });
    }

    it('raises an error when output file is not readable', async function() {
        const config = {
            outputFilePath: 'path/does/not/exist.txt',
        };
        await A.rejects(extractResult(config));
    });

    // it('raises an error when no output found', async function() {
    //     const config = {
    //         outputFilePath: path.join(__dirname, 'data', 'extract', 'pytest_output.txt'),
    //     };
    //     await A.rejects(extractResult(config), /^Error: No benchmark result was found in /);
    // });

    // const toolSpecificErrorCases: Array<{
    //     it: string;
    //     tool: ToolType;
    //     file: string;
    //     expected: RegExp;
    // }> = [
    //     ...(['pytest', 'googlecpp'] as const).map(tool => ({
    //         it: `raises an error when output file is not in JSON with tool '${tool}'`,
    //         tool,
    //         file: 'go_output.txt',
    //         expected: /must be JSON file/,
    //     })),
    // ];

    // for (const t of toolSpecificErrorCases) {
    //     it(t.it, async function() {
    //         // Note: go_output.txt is not in JSON format!
    //         const outputFilePath = path.join(__dirname, 'data', 'extract', t.file);
    //         const config = { tool: t.tool, outputFilePath };
    //         await A.rejects(extractResult(config), t.expected);
    //     });
    // }

    it('collects the commit information from pull_request payload as fallback', async function() {
        dummyGitHubContext.payload = {
            pull_request: {
                title: 'this is title',
                html_url: 'https://github.com/dummy/repo/pull/1',
                head: {
                    sha: 'abcdef0123456789',
                    user: {
                        login: 'user',
                    },
                    repo: {
                        updated_at: 'repo updated at timestamp',
                    },
                },
            },
        };
        const outputFilePath = path.join(__dirname, 'data', 'extract', 'pytest_output.txt');
        const config = {
            outputFilePath,
        };
        const { commit } = await extractResult(config);
        A.equal(commit.id, 'abcdef0123456789');
        A.equal(commit.message, 'this is title');
        A.equal(commit.timestamp, 'repo updated at timestamp');
        A.equal(commit.url, 'https://github.com/dummy/repo/pull/1/commits/abcdef0123456789');
    });

    it('raises an error when commit information is not found in webhook payload', async function() {
        dummyGitHubContext.payload = {};
        const outputFilePath = path.join(__dirname, 'data', 'extract', 'pytest_output.txt');
        const config = {
            outputFilePath,
        };
        await A.rejects(extractResult(config), /^Error: No commit information is found in payload/);
    });
});
