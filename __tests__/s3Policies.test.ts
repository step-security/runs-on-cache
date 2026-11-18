import { CompressionMethod } from "@actions/cache/lib/internal/constants";
import * as core from "@actions/core";
import {
    AbortMultipartUploadCommand,
    CompleteMultipartUploadCommand,
    CreateMultipartUploadCommand,
    PutObjectCommand,
    S3Client,
    UploadPartCommand
} from "@aws-sdk/client-s3";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

jest.mock("@actions/core");
process.env.RUNS_ON_S3_BUCKET_CACHE = "test-bucket";
process.env.AWS_REGION = "eu-central-1";
process.env.UPLOAD_PART_SIZE = "5";
let backend: typeof import("../src/custom/backend");
beforeAll(async () => {
    backend = await import("../src/custom/backend");
});
const inputs: Record<string, string> = {};

beforeEach(() => {
    jest.spyOn(core, "getInput").mockImplementation(name => inputs[name] || "");
});
afterEach(() => {
    for (const name of Object.keys(inputs)) delete inputs[name];
    jest.restoreAllMocks();
});

test.each(["", "true"])(
    "exact-match-only=%s preserves or excludes an extending key",
    async exact => {
        inputs["exact-match-only"] = exact;
        jest.spyOn(S3Client.prototype, "send").mockImplementation(
            async command =>
                ({
                    Contents: [
                        {
                            Key: `${(command.input as { Prefix: string }).Prefix}-extra`,
                            LastModified: new Date()
                        }
                    ]
                }) as never
        );
        const result = await backend.getCacheEntry(["key"], ["directory"], {
            compressionMethod: CompressionMethod.Gzip,
            enableCrossOsArchive: true
        });
        expect(result.cacheKey).toBe(exact ? undefined : "key-extra");
    }
);

test.each([
    [1, ""],
    [1, "true"],
    [6 * 1024 * 1024, "true"]
])(
    "immutable publication guards the final write for %i bytes",
    async (bytes, immutable) => {
        inputs.immutable = String(immutable);
        const directory = await fs.mkdtemp(
            path.join(os.tmpdir(), "cache-policy-")
        );
        const archive = path.join(directory, "archive");
        await fs.writeFile(archive, Buffer.alloc(Number(bytes)));
        const commands: unknown[] = [];
        jest.spyOn(S3Client.prototype, "send").mockImplementation(
            async command => {
                commands.push(command);
                if (command instanceof CreateMultipartUploadCommand)
                    return { UploadId: "upload" } as never;
                if (
                    command instanceof UploadPartCommand ||
                    command instanceof PutObjectCommand
                )
                    return { ETag: "etag" } as never;
                return {} as never;
            }
        );
        try {
            await backend.saveCache("key", ["directory"], archive, {
                compressionMethod: CompressionMethod.Gzip,
                enableCrossOsArchive: true,
                cacheSize: 1
            });
            const commit = commands.find(
                command =>
                    command instanceof PutObjectCommand ||
                    command instanceof CompleteMultipartUploadCommand
            ) as PutObjectCommand;
            expect(commit.input.IfNoneMatch).toBe(immutable ? "*" : undefined);
        } finally {
            await fs.rm(directory, { recursive: true, force: true });
        }
    }
);

test("immutable multipart conflict cannot replace the winning object", async () => {
    inputs.immutable = "true";
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "cache-policy-"));
    const archive = path.join(directory, "archive");
    await fs.writeFile(archive, Buffer.alloc(6 * 1024 * 1024));
    const conflict = Object.assign(new Error("already published"), {
        name: "PreconditionFailed"
    });
    const send = jest
        .spyOn(S3Client.prototype, "send")
        .mockImplementation(async command => {
            if (command instanceof CreateMultipartUploadCommand)
                return { UploadId: "upload" } as never;
            if (command instanceof UploadPartCommand)
                return { ETag: "etag" } as never;
            if (command instanceof CompleteMultipartUploadCommand)
                throw conflict;
            return {} as never;
        });
    try {
        await expect(
            backend.saveCache("key", ["directory"], archive, {
                compressionMethod: CompressionMethod.Gzip,
                enableCrossOsArchive: true,
                cacheSize: 1
            })
        ).rejects.toBe(conflict);
        expect(
            send.mock.calls.some(
                ([command]) => command instanceof AbortMultipartUploadCommand
            )
        ).toBe(true);
    } finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
});
