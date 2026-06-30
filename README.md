[![StepSecurity Maintained Action](https://raw.githubusercontent.com/step-security/maintained-actions-assets/main/assets/maintained-action-banner.png)](https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions)

# Shockingly faster cache action

This action is a drop-in replacement for the official actions/cache@v5 action, maintained by StepSecurity. It provides high-performance caching using S3, optimized for self-hosted or RunsOn runners.

It will automatically store your caches in a dedicated RunsOn S3 bucket that lives close to your self-hosted runners, ensuring you get at least 200MiB/s download and upload throughput when using caches in your workflows. The larger the cache, the faster the speed.

Also note that you no longer have any limit on the size of the cache. The bucket has a lifecycle rule to remove items older than 10 days.

If no S3 bucket is provided, it will also transparently switch to the default behaviour. This means you can use this action and switch between RunsOn runners and official GitHub runners with no change.

>Two other actions are available in addition to the primary `cache` action:
>
>* [Restore action](./restore/README.md)
>* [Save action](./save/README.md)

[![Tests](https://github.com/step-security/runs-on-cache/actions/workflows/tests.yml/badge.svg)](https://github.com/step-security/runs-on-cache/actions/workflows/tests.yml)

## Usage with RunsOn

If using [RunsOn](https://runs-on.com), simply replace `actions/cache@v5` with `step-security/runs-on-cache@v5`. All the official options are supported.

```diff
- - uses: actions/cache@v5
+ - uses: step-security/runs-on-cache@v5
    with:
      ...
```

Please refer to [actions/cache](https://github.com/actions/cache) for detailed usage.

## Usage outside RunsOn

If you want to use this in your own infrastructure, setup your AWS credentials with [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials), then:

```yaml
  - uses: aws-actions/configure-aws-credentials@v4
    ...
  - uses: step-security/runs-on-cache@v5
    with:
      ...
    env:
      RUNS_ON_S3_BUCKET_CACHE: name-of-your-bucket
```

Be aware of S3 transfer costs if your runners are not in the same AWS region as your bucket.

## Special environment variables

* `RUNS_ON_S3_BUCKET_CACHE`: if set, the action will use this bucket to store the cache.
* `RUNS_ON_S3_BUCKET_ENDPOINT`: if set, the action will use this endpoint to connect to the bucket. This is useful if you are using AWS's S3 transfer acceleration or a non-AWS S3-compatible service.
* `RUNS_ON_RUNNER_NAME`: when running on RunsOn, where this environment variable is non-empty, existing AWS credentials from the environment will be discarded. If you want to preserve existing environment variables, set this to the empty string `""`.
* `RUNS_ON_S3_FORCE_PATH_STYLE` or `AWS_S3_FORCE_PATH_STYLE`: if one of those environment variables equals the string `"true"`, then the S3 client will be configured to force the path style.

## Usage

### Pre-requisites

Create a workflow `.yml` file in your repository's `.github/workflows` directory. An [example workflow](#example-cache-workflow) is available below. For more information, see the GitHub Help Documentation for [Creating a workflow file](https://help.github.com/en/articles/configuring-a-workflow#creating-a-workflow-file).

If you are using this inside a container, a POSIX-compliant `tar` needs to be included and accessible from the execution path.

Note: `actions/cache@v5` runs on Node.js 24 and requires a minimum Actions Runner version of `2.327.1`.

If you are using a `self-hosted` Windows runner, `GNU tar` and `zstd` are required for [Cross-OS caching](https://github.com/actions/cache/blob/main/tips-and-workarounds.md#cross-os-cache) to work. They are also recommended to be installed in general so the performance is on par with `hosted` Windows runners.

### Inputs

* `key` - An explicit key for a cache entry. See [creating a cache key](#creating-a-cache-key).
* `path` - A list of files, directories, and wildcard patterns to cache and restore. See [`@actions/glob`](https://github.com/actions/toolkit/tree/main/packages/glob) for supported patterns.
* `restore-keys` - An ordered multiline string listing the prefix-matched keys, that are used for restoring stale cache if no cache hit occurred for key.
* `enableCrossOsArchive` - An optional boolean when enabled, allows Windows runners to save or restore caches that can be restored or saved respectively on other platforms. Default: `false`
* `fail-on-cache-miss` - Fail the workflow if cache entry is not found. Default: `false`
* `lookup-only` - If true, only checks if cache entry exists and skips download. Does not change save cache behavior. Default: `false`

#### Environment Variables

* `SEGMENT_DOWNLOAD_TIMEOUT_MINS` - Segment download timeout (in minutes, default `10`) to abort download of the segment if not completed in the defined number of minutes. [Read more](https://github.com/actions/cache/blob/main/tips-and-workarounds.md#cache-segment-restore-timeout)

### Outputs

* `cache-hit` - A string value to indicate an exact match was found for the key.
  * If there's a cache hit, this will be 'true' or 'false' to indicate if there's an exact match for `key`.
  * If there's a cache miss, this will be an empty string.

See [Skipping steps based on cache-hit](#skipping-steps-based-on-cache-hit) for info on using this output

### Cache scopes

The cache is scoped to the key, [version](#cache-version), and branch. The default branch cache is available to other branches.

See [Matching a cache key](https://help.github.com/en/actions/configuring-and-managing-workflows/caching-dependencies-to-speed-up-workflows#matching-a-cache-key) for more info.

### Example cache workflow

#### Restoring and saving cache using a single action

```yaml
name: Caching Primes

on: push

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v7

    - name: Cache Primes
      id: cache-primes
      uses: step-security/runs-on-cache@v5
      with:
        path: prime-numbers
        key: ${{ runner.os }}-primes

    - name: Generate Prime Numbers
      if: steps.cache-primes.outputs.cache-hit != 'true'
      run: /generate-primes.sh -d prime-numbers

    - name: Use Prime Numbers
      run: /primes.sh -d prime-numbers
```

The `cache` action provides a `cache-hit` output which is set to `true` when the cache is restored using the primary `key` and `false` when the cache is restored using `restore-keys` or no cache is restored.

#### Using a combination of restore and save actions

```yaml
name: Caching Primes

on: push

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v7

    - name: Restore cached Primes
      id: cache-primes-restore
      uses: step-security/runs-on-cache/restore@v5
      with:
        path: |
          path/to/dependencies
          some/other/dependencies
        key: ${{ runner.os }}-primes
    .
    . //intermediate workflow steps
    .
    - name: Save Primes
      id: cache-primes-save
      uses: step-security/runs-on-cache/save@v5
      with:
        path: |
          path/to/dependencies
          some/other/dependencies
        key: ${{ steps.cache-primes-restore.outputs.cache-primary-key }}
```

> **Note**
> You must use the `cache` or `restore` action in your workflow before you need to use the files that might be restored from the cache. If the provided `key` matches an existing cache, a new cache is not created and if the provided `key` doesn't match an existing cache, a new cache is automatically created provided the job completes successfully.

## Caching Strategies

With the introduction of the `restore` and `save` actions, a lot of caching use cases can now be achieved. Please see the [caching strategies](./caching-strategies.md) document for understanding how you can use the actions strategically to achieve the desired goal.

## Creating a cache key

A cache key can include any of the contexts, functions, literals, and operators supported by GitHub Actions.

For example, using the [`hashFiles`](https://docs.github.com/en/actions/learn-github-actions/expressions#hashfiles) function allows you to create a new cache when dependencies change.

```yaml
  - uses: step-security/runs-on-cache@v5
    with:
      path: |
        path/to/dependencies
        some/other/dependencies
      key: ${{ runner.os }}-${{ hashFiles('**/lockfiles') }}
```

Additionally, you can use arbitrary command output in a cache key, such as a date or software version:

```yaml
  # http://man7.org/linux/man-pages/man1/date.1.html
  - name: Get Date
    id: get-date
    run: |
      echo "date=$(/bin/date -u "+%Y%m%d")" >> $GITHUB_OUTPUT
    shell: bash

  - uses: step-security/runs-on-cache@v5
    with:
      path: path/to/dependencies
      key: ${{ runner.os }}-${{ steps.get-date.outputs.date }}-${{ hashFiles('**/lockfiles') }}
```

See [Using contexts to create cache keys](https://help.github.com/en/actions/configuring-and-managing-workflows/caching-dependencies-to-speed-up-workflows#using-contexts-to-create-cache-keys)

## Cache Limits

A repository can have up to 10GB of caches. Once the 10GB limit is reached, older caches will be evicted based on when the cache was last accessed.  Caches that are not accessed within the last week will also be evicted.

## Skipping steps based on cache-hit

Using the `cache-hit` output, subsequent steps (such as install or build) can be skipped when a cache hit occurs on the key.  It is recommended to install missing/updated dependencies in case of a partial key match when the key is dependent on the `hash` of the package file.

Example:

```yaml
steps:
  - uses: actions/checkout@v7

  - uses: step-security/runs-on-cache@v5
    id: cache
    with:
      path: path/to/dependencies
      key: ${{ runner.os }}-${{ hashFiles('**/lockfiles') }}

  - name: Install Dependencies
    if: steps.cache.outputs.cache-hit != 'true'
    run: /install.sh
```

> **Note** The `id` defined in `step-security/runs-on-cache` must match the `id` in the `if` statement (i.e. `steps.[ID].outputs.cache-hit`)

## Cache Version

Cache version is a hash [generated](https://github.com/actions/toolkit/blob/500d0b42fee2552ae9eeb5933091fe2fbf14e72d/packages/cache/src/internal/cacheHttpClient.ts#L73-L90) for a combination of compression tool used (Gzip, Zstd, etc. based on the runner OS) and the `path` of directories being cached. If two caches have different versions, they are identified as unique caches while matching. This, for example, means that a cache created on a `windows-latest` runner can't be restored on `ubuntu-latest` as cache `Version`s are different.

> Pro tip: The [list caches](https://docs.github.com/en/rest/actions/cache#list-github-actions-caches-for-a-repository) API can be used to get the version of a cache. This can be helpful to troubleshoot cache miss due to version.

<details>
  <summary>Example</summary>
The workflow will create 3 unique caches with same keys. Ubuntu and windows runners will use different compression technique and hence create two different caches. And `build-linux` will create two different caches as the `paths` are different.

```yaml
jobs:
  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - name: Cache Primes
        id: cache-primes
        uses: step-security/runs-on-cache@v5
        with:
          path: prime-numbers
          key: primes

      - name: Generate Prime Numbers
        if: steps.cache-primes.outputs.cache-hit != 'true'
        run: ./generate-primes.sh -d prime-numbers

      - name: Cache Numbers
        id: cache-numbers
        uses: step-security/runs-on-cache@v5
        with:
          path: numbers
          key: primes

      - name: Generate Numbers
        if: steps.cache-numbers.outputs.cache-hit != 'true'
        run: ./generate-primes.sh -d numbers

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v7

      - name: Cache Primes
        id: cache-primes
        uses: step-security/runs-on-cache@v5
        with:
          path: prime-numbers
          key: primes

      - name: Generate Prime Numbers
        if: steps.cache-primes.outputs.cache-hit != 'true'
        run: ./generate-primes -d prime-numbers
```

</details>

## Known practices and workarounds

There are a number of community practices/workarounds to fulfill specific requirements. You may choose to use them if they suit your use case. Note these are not necessarily the only solution or even a recommended solution.

* [Cache segment restore timeout](./tips-and-workarounds.md#cache-segment-restore-timeout)
* [Update a cache](./tips-and-workarounds.md#update-a-cache)
* [Use cache across feature branches](./tips-and-workarounds.md#use-cache-across-feature-branches)
* [Cross OS cache](./tips-and-workarounds.md#cross-os-cache)
* [Force deletion of caches overriding default cache eviction policy](./tips-and-workarounds.md#force-deletion-of-caches-overriding-default-cache-eviction-policy)

### Windows environment variables

Please note that Windows environment variables (like `%LocalAppData%`) will NOT be expanded by this action. Instead, prefer using `~` in your paths which will expand to the HOME directory. For example, instead of `%LocalAppData%`, use `~\AppData\Local`. For a list of supported default environment variables, see the [Learn GitHub Actions: Variables](https://docs.github.com/en/actions/learn-github-actions/variables#default-environment-variables) page.

## Note

Thank you for your interest in this GitHub repo, however, right now we are not taking contributions. 

We continue to focus our resources on strategic areas that help our customers be successful while making developers' lives easier. While GitHub Actions remains a key part of this vision, we are allocating resources towards other areas of Actions and are not taking contributions to this repository at this time. The GitHub public roadmap is the best place to follow along for any updates on features we're working on and what stage they're in.

We are taking the following steps to better direct requests related to GitHub Actions, including:

1. We will be directing questions and support requests to our [Community Discussions area](https://github.com/orgs/community/discussions/categories/actions)

2. High Priority bugs can be reported through Community Discussions or you can report these to our support team https://support.github.com/contact/bug-report.

3. Security Issues should be handled as per our [security.md](SECURITY.md).

We will still provide security updates for this project and fix major breaking changes during this time.

You are welcome to still raise bugs in this repo.

## License

The scripts and documentation in this project are released under the [MIT License](LICENSE)
