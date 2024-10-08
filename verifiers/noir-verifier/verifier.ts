import * as fs from "fs";
import { parseArgs } from "util";
import { spawn } from "child_process";

interface HyleOutput {
    version: number;
    initial_state: number[];
    next_state: number[];
    identity: string;
    tx_hash: number[];
    index: number;
    payloads: number[];
    success: boolean;
}

function parseString(vector: string[]): string {
    let length = parseInt(vector.shift() as string);
    let resp = "";
    for (var i = 0; i < length; i += 1) resp += String.fromCharCode(parseInt(vector.shift() as string, 16));
    return resp;
}

function parseArray(vector: string[]): number[] {
    let length = parseInt(vector.shift() as string);
    let resp: number[] = [];
    for (var i = 0; i < length; i += 1) resp.push(parseInt(vector.shift() as string, 16));
    return resp;
}

function parsePayloads(vector: string[]): number[] {
    let payloadLen = parseInt(vector.shift() as string);
    const payloadData = vector.splice(0, 2800);

    let payloadNumber = parseInt(payloadData.shift() as string);
    let payload: string = "";

    for (let i = 0; i < payloadNumber; i++) {
        let payloadSize = parseInt(payloadData.shift() as string);
        payload += payloadSize.toString();
        for (let j = 0; j < payloadSize; j++) {
            let d: string = BigInt(payloadData.shift() as string).toString();
            payload += " ";
            payload += d;
        }
    }
    return Array.from(new TextEncoder().encode(payload));
}

function deserializePublicInputs<T>(publicInputs: string[]): HyleOutput {
    const version = parseInt(publicInputs.shift() as string);

    const initial_state = parseArray(publicInputs);
    const next_state = parseArray(publicInputs);
    const identity = parseString(publicInputs);
    const tx_hash = parseArray(publicInputs);
    const index = parseInt(publicInputs.shift() as string);
    const payloads = parsePayloads(publicInputs);
    const success = parseInt(publicInputs.shift() as string) === 1;
    // We don't parse the rest, which correspond to programOutputs
    return {
        version,
        initial_state,
        next_state,
        identity,
        tx_hash,
        index,
        payloads,
        success,
    };
}

function runCommand(command: string, args: string[]) {
    return new Promise<void>((resolve, reject) => {
        const process = spawn(command, args);

        process.stdout.on("data", (data) => {
            console.log(`Output: ${data}`);
        });

        process.stderr.on("data", (data) => {
            console.error(`Error: ${data}`);
        });

        process.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Process exited with code ${code}`));
            }
        });
    });
}

async function main() {
    const { values, positionals } = parseArgs({
        args: process.argv,
        options: {
            vKeyPath: {
                type: "string",
            },
            proofPath: {
                type: "string",
            },
            outputPath: {
                type: "string",
            },
        },
        strict: true,
        allowPositionals: true,
    });

    const command = "bash";
    const argsVerification = ["-c", `bb verify -p ${values.proofPath} -k ${values.vKeyPath}`];
    await runCommand(command, argsVerification);
    // Proof is considered valid

    const argsProofAsFields = [
        "-c",
        `bb proof_as_fields -p ${values.proofPath} -k ${values.vKeyPath} -o ${values.outputPath}`,
    ];
    await runCommand(command, argsProofAsFields);

    let proofAsFields: string[] = JSON.parse(fs.readFileSync(values.outputPath));
    const hyleOutput = deserializePublicInputs(proofAsFields);

    var stringified_output = JSON.stringify(hyleOutput);

    process.stdout.write(stringified_output);
    process.exit(0);
}

try {
    await main();
} catch (e) {
    console.error(e);
    process.exit(1);
}
