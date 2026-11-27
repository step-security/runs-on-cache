import { CompressionMethod } from "@actions/cache/lib/internal/constants";
import { S3Client } from "@aws-sdk/client-s3";

const environment = { ...process.env };
process.env.RUNS_ON_S3_BUCKET_CACHE = "test-bucket";
process.env.AWS_REGION = "eu-central-1";
process.env.GITHUB_REPOSITORY = "test/repository";

let backend: typeof import("../src/custom/backend");
const paths = ["node_modules"];
const options = {
    compressionMethod: CompressionMethod.Gzip,
    enableCrossOsArchive: true
};

beforeAll(async () => {
    backend = await import("../src/custom/backend");
});

afterEach(() => jest.restoreAllMocks());

afterAll(() => {
    process.env = environment;
});

function mockObjects(objects: [string, number][]): jest.SpyInstance {
    const version = backend.getCacheVersion(
        paths,
        options.compressionMethod,
        true
    );
    const prefix = `cache/test/repository/${version}/`;
    return jest
        .spyOn(S3Client.prototype, "send")
        .mockImplementation(async command => {
            const request = command.input as { Prefix: string };
            return {
                Contents: objects
                    .map(([key, modified]) => ({
                        Key: `${prefix}${key}`,
                        LastModified: new Date(modified)
                    }))
                    .filter(object => object.Key.startsWith(request.Prefix))
            } as never;
        });
}

test.each([
    ["build-123", "build-123-extra"],
    ["build-1234-1", "build-1234-10"]
])("prefers exact %s over a newer %s", async (key, extendingKey) => {
    const send = mockObjects([
        [key, 1],
        [extendingKey, 2]
    ]);

    const result = await backend.getCacheEntry([key], paths, options);

    expect(result.cacheKey).toBe(key);
    expect(result.archiveLocation).toMatch(new RegExp(`/${key}$`));
    expect(send).toHaveBeenCalledTimes(1);
});

test("keeps newest primary-key prefix fallback when no exact key exists", async () => {
    mockObjects([
        ["build-123-older", 1],
        ["build-123-newer", 2]
    ]);

    const result = await backend.getCacheEntry(["build-123"], paths, options);

    expect(result.cacheKey).toBe("build-123-newer");
});

test("prefers an exact restore key after the primary key misses", async () => {
    const send = mockObjects([
        ["fallback", 1],
        ["fallback-newer", 2]
    ]);

    const result = await backend.getCacheEntry(
        ["missing", "fallback"],
        paths,
        options
    );

    expect(result.cacheKey).toBe("fallback");
    expect(send).toHaveBeenCalledTimes(2);
});

test("keeps restore-key order ahead of newer matches for later keys", async () => {
    const send = mockObjects([
        ["first-older", 1],
        ["first-newer", 2],
        ["second", 3]
    ]);

    const result = await backend.getCacheEntry(
        ["missing", "first-", "second"],
        paths,
        options
    );

    expect(result.cacheKey).toBe("first-newer");
    expect(send).toHaveBeenCalledTimes(2);
});

test("keeps primary-key prefix matches ahead of restore keys", async () => {
    const send = mockObjects([
        ["build-123-extra", 1],
        ["fallback", 2]
    ]);

    const result = await backend.getCacheEntry(
        ["build-123", "fallback"],
        paths,
        options
    );

    expect(result.cacheKey).toBe("build-123-extra");
    expect(send).toHaveBeenCalledTimes(1);
});

test("returns no entry when all keys miss", async () => {
    const send = mockObjects([]);

    const result = await backend.getCacheEntry(
        ["missing", "fallback"],
        paths,
        options
    );

    expect(result).toEqual({});
    expect(send).toHaveBeenCalledTimes(2);
});
