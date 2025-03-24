import * as cache from "@actions/cache";
import * as core from "@actions/core";

import { Events, Inputs, Outputs, State } from "./constants";
import {
    IStateProvider,
    NullStateProvider,
    StateProvider
} from "./stateProvider";
import * as utils from "./utils/actionUtils";

import * as custom from "./custom/cache";
import axios, { isAxiosError } from 'axios';
const canSaveToS3 = process.env["RUNS_ON_S3_BUCKET_CACHE"] !== undefined;

export async function restoreImpl(
    stateProvider: IStateProvider,
    earlyExit?: boolean | undefined
): Promise<string | undefined> {
    try {
        if (!utils.isCacheFeatureAvailable()) {
            core.setOutput(Outputs.CacheHit, "false");
            return;
        }

        // Validate inputs, this can cause task failure
        if (!utils.isValidEvent()) {
            utils.logWarning(
                `Event Validation Error: The event type ${
                    process.env[Events.Key]
                } is not supported because it's not tied to a branch or tag ref.`
            );
            return;
        }

        const primaryKey = core.getInput(Inputs.Key, { required: true });
        stateProvider.setState(State.CachePrimaryKey, primaryKey);

        const restoreKeys = utils.getInputAsArray(Inputs.RestoreKeys);
        const cachePaths = utils.getInputAsArray(Inputs.Path, {
            required: true
        });
        const enableCrossOsArchive = utils.getInputAsBool(
            Inputs.EnableCrossOsArchive
        );
        const failOnCacheMiss = utils.getInputAsBool(Inputs.FailOnCacheMiss);
        const lookupOnly = utils.getInputAsBool(Inputs.LookupOnly);

        let cacheKey: string | undefined;

        if (canSaveToS3) {
            core.info(
                "The cache action detected a local S3 bucket cache. Using it."
            );
            cacheKey = await custom.restoreCache(
                cachePaths,
                primaryKey,
                restoreKeys,
                { lookupOnly: lookupOnly }
            );
        } else {
            cacheKey = await cache.restoreCache(
                cachePaths,
                primaryKey,
                restoreKeys,
                { lookupOnly: lookupOnly },
                enableCrossOsArchive
            );
        }

        if (!cacheKey) {
            if (failOnCacheMiss) {
                throw new Error(
                    `Failed to restore cache entry. Exiting as fail-on-cache-miss is set. Input key: ${primaryKey}`
                );
            }
            core.info(
                `Cache not found for input keys: ${[
                    primaryKey,
                    ...restoreKeys
                ].join(", ")}`
            );

            return;
        }

        // Store the matched cache key in states
        stateProvider.setState(State.CacheMatchedKey, cacheKey);

        const isExactKeyMatch = utils.isExactKeyMatch(
            core.getInput(Inputs.Key, { required: true }),
            cacheKey
        );

        core.setOutput(Outputs.CacheHit, isExactKeyMatch.toString());
        if (lookupOnly) {
            core.info(`Cache found and can be restored from key: ${cacheKey}`);
        } else {
            core.info(`Cache restored from key: ${cacheKey}`);
        }

        return cacheKey;
    } catch (error: unknown) {
        core.setFailed((error as Error).message);
        if (earlyExit) {
            process.exit(1);
        }
    }
}

async function run(
    stateProvider: IStateProvider,
    earlyExit: boolean | undefined
): Promise<void> {
    await restoreImpl(stateProvider, earlyExit);

    // node will stay alive if any promises are not resolved,
    // which is a possibility if HTTP requests are dangling
    // due to retries or timeouts. We know that if we got here
    // that all promises that we care about have successfully
    // resolved, so simply exit with success.
    if (earlyExit) {
        process.exit(0);
    }
}

export async function restoreOnlyRun(
    earlyExit?: boolean | undefined
): Promise<void> {
    await validateSubscription();
    await run(new NullStateProvider(), earlyExit);
}

export async function restoreRun(
    earlyExit?: boolean | undefined
): Promise<void> {
    await run(new StateProvider(), earlyExit);
}

async function validateSubscription(): Promise<void> {
    const API_URL = `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/subscription`
  
    try {
      await axios.get(API_URL, {timeout: 3000})
    } catch (error) {
      if (isAxiosError(error) && error.response) {
        core.error(
          'Subscription is not valid. Reach out to support@stepsecurity.io'
        )
        process.exit(1)
      } else {
        core.info('Timeout or API not reachable. Continuing to next step.')
      }
    }
}