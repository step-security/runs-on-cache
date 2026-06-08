exports.id = 605;
exports.ids = [605];
exports.modules = {

/***/ 1509:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.checkUrl = void 0;
const config_1 = __webpack_require__(47291);
const LOOPBACK_CIDR_IPv4 = "127.0.0.0/8";
const LOOPBACK_CIDR_IPv6 = "::1/128";
const ECS_CONTAINER_HOST = "169.254.170.2";
const EKS_CONTAINER_HOST_IPv4 = "169.254.170.23";
const EKS_CONTAINER_HOST_IPv6 = "[fd00:ec2::23]";
const checkUrl = (url, logger) => {
    if (url.protocol === "https:") {
        return;
    }
    if (url.hostname === ECS_CONTAINER_HOST ||
        url.hostname === EKS_CONTAINER_HOST_IPv4 ||
        url.hostname === EKS_CONTAINER_HOST_IPv6) {
        return;
    }
    if (url.hostname.includes("[")) {
        if (url.hostname === "[::1]" || url.hostname === "[0000:0000:0000:0000:0000:0000:0000:0001]") {
            return;
        }
    }
    else {
        if (url.hostname === "localhost") {
            return;
        }
        const ipComponents = url.hostname.split(".");
        const inRange = (component) => {
            const num = parseInt(component, 10);
            return 0 <= num && num <= 255;
        };
        if (ipComponents[0] === "127" &&
            inRange(ipComponents[1]) &&
            inRange(ipComponents[2]) &&
            inRange(ipComponents[3]) &&
            ipComponents.length === 4) {
            return;
        }
    }
    throw new config_1.CredentialsProviderError(`URL not accepted. It must either be HTTPS or match one of the following:
  - loopback CIDR 127.0.0.0/8 or [::1/128]
  - ECS container host 169.254.170.2
  - EKS container host 169.254.170.23 or [fd00:ec2::23]`, { logger });
};
exports.checkUrl = checkUrl;


/***/ }),

/***/ 68712:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.fromHttp = void 0;
const tslib_1 = __webpack_require__(60615);
const client_1 = __webpack_require__(5152);
const config_1 = __webpack_require__(47291);
const node_http_handler_1 = __webpack_require__(42402);
const promises_1 = tslib_1.__importDefault(__webpack_require__(51455));
const checkUrl_1 = __webpack_require__(1509);
const requestHelpers_1 = __webpack_require__(78914);
const retry_wrapper_1 = __webpack_require__(51122);
const AWS_CONTAINER_CREDENTIALS_RELATIVE_URI = "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI";
const DEFAULT_LINK_LOCAL_HOST = "http://169.254.170.2";
const AWS_CONTAINER_CREDENTIALS_FULL_URI = "AWS_CONTAINER_CREDENTIALS_FULL_URI";
const AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE = "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE";
const AWS_CONTAINER_AUTHORIZATION_TOKEN = "AWS_CONTAINER_AUTHORIZATION_TOKEN";
const fromHttp = (options = {}) => {
    options.logger?.debug("@aws-sdk/credential-provider-http - fromHttp");
    let host;
    const relative = options.awsContainerCredentialsRelativeUri ?? process.env[AWS_CONTAINER_CREDENTIALS_RELATIVE_URI];
    const full = options.awsContainerCredentialsFullUri ?? process.env[AWS_CONTAINER_CREDENTIALS_FULL_URI];
    const token = options.awsContainerAuthorizationToken ?? process.env[AWS_CONTAINER_AUTHORIZATION_TOKEN];
    const tokenFile = options.awsContainerAuthorizationTokenFile ?? process.env[AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE];
    const warn = options.logger?.constructor?.name === "NoOpLogger" || !options.logger?.warn
        ? console.warn
        : options.logger.warn.bind(options.logger);
    if (relative && full) {
        warn("@aws-sdk/credential-provider-http: " +
            "you have set both awsContainerCredentialsRelativeUri and awsContainerCredentialsFullUri.");
        warn("awsContainerCredentialsFullUri will take precedence.");
    }
    if (token && tokenFile) {
        warn("@aws-sdk/credential-provider-http: " +
            "you have set both awsContainerAuthorizationToken and awsContainerAuthorizationTokenFile.");
        warn("awsContainerAuthorizationToken will take precedence.");
    }
    if (full) {
        host = full;
    }
    else if (relative) {
        host = `${DEFAULT_LINK_LOCAL_HOST}${relative}`;
    }
    else {
        throw new config_1.CredentialsProviderError(`No HTTP credential provider host provided.
Set AWS_CONTAINER_CREDENTIALS_FULL_URI or AWS_CONTAINER_CREDENTIALS_RELATIVE_URI.`, { logger: options.logger });
    }
    const url = new URL(host);
    (0, checkUrl_1.checkUrl)(url, options.logger);
    const requestHandler = node_http_handler_1.NodeHttpHandler.create({ connectionTimeout: options.timeout ?? 1000 });
    const requestTimeout = options.timeout ?? 1000;
    const provider = (0, retry_wrapper_1.retryWrapper)(async () => {
        const request = (0, requestHelpers_1.createGetRequest)(url);
        if (token) {
            request.headers.Authorization = token;
        }
        else if (tokenFile) {
            request.headers.Authorization = (await promises_1.default.readFile(tokenFile)).toString();
        }
        try {
            const result = await requestHandler.handle(request, { requestTimeout });
            return (0, requestHelpers_1.getCredentials)(result.response).then((creds) => (0, client_1.setCredentialFeature)(creds, "CREDENTIALS_HTTP", "z"));
        }
        catch (e) {
            throw new config_1.CredentialsProviderError(String(e), { logger: options.logger });
        }
    }, options.maxRetries ?? 3, options.timeout ?? 1000);
    return async () => {
        try {
            return await provider();
        }
        finally {
            requestHandler.destroy?.();
        }
    };
};
exports.fromHttp = fromHttp;


/***/ }),

/***/ 78914:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createGetRequest = createGetRequest;
exports.getCredentials = getCredentials;
const config_1 = __webpack_require__(47291);
const protocols_1 = __webpack_require__(93422);
const serde_1 = __webpack_require__(92430);
const serde_2 = __webpack_require__(92430);
function createGetRequest(url) {
    return new protocols_1.HttpRequest({
        protocol: url.protocol,
        hostname: url.hostname,
        port: Number(url.port),
        path: url.pathname,
        query: Array.from(url.searchParams.entries()).reduce((acc, [k, v]) => {
            acc[k] = v;
            return acc;
        }, {}),
        fragment: url.hash,
    });
}
async function getCredentials(response, logger) {
    const stream = (0, serde_2.sdkStreamMixin)(response.body);
    const str = await stream.transformToString();
    if (response.statusCode === 200) {
        const parsed = JSON.parse(str);
        if (typeof parsed.AccessKeyId !== "string" ||
            typeof parsed.SecretAccessKey !== "string" ||
            typeof parsed.Token !== "string" ||
            typeof parsed.Expiration !== "string") {
            throw new config_1.CredentialsProviderError("HTTP credential provider response not of the required format, an object matching: " +
                "{ AccessKeyId: string, SecretAccessKey: string, Token: string, Expiration: string(rfc3339) }", { logger });
        }
        return {
            accessKeyId: parsed.AccessKeyId,
            secretAccessKey: parsed.SecretAccessKey,
            sessionToken: parsed.Token,
            expiration: (0, serde_1.parseRfc3339DateTime)(parsed.Expiration),
        };
    }
    if (response.statusCode >= 400 && response.statusCode < 500) {
        let parsedBody = {};
        try {
            parsedBody = JSON.parse(str);
        }
        catch (e) { }
        throw Object.assign(new config_1.CredentialsProviderError(`Server responded with status: ${response.statusCode}`, { logger }), {
            Code: parsedBody.Code,
            Message: parsedBody.Message,
        });
    }
    throw new config_1.CredentialsProviderError(`Server responded with status: ${response.statusCode}`, { logger });
}


/***/ }),

/***/ 51122:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.retryWrapper = void 0;
const retryWrapper = (toRetry, maxRetries, delayMs) => {
    return async () => {
        for (let i = 0; i < maxRetries; ++i) {
            try {
                return await toRetry();
            }
            catch (e) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
        return await toRetry();
    };
};
exports.retryWrapper = retryWrapper;


/***/ }),

/***/ 98605:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var fromHttp = __webpack_require__(68712);



exports.fromHttp = fromHttp.fromHttp;


/***/ }),

/***/ 42402:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var protocols = __webpack_require__(93422);
var node_https = __webpack_require__(44708);
var node_stream = __webpack_require__(57075);
var http2 = __webpack_require__(32467);

function buildAbortError(abortSignal) {
    const reason = abortSignal && typeof abortSignal === "object" && "reason" in abortSignal
        ? abortSignal.reason
        : undefined;
    if (reason) {
        if (reason instanceof Error) {
            const abortError = new Error("Request aborted");
            abortError.name = "AbortError";
            abortError.cause = reason;
            return abortError;
        }
        const abortError = new Error(String(reason));
        abortError.name = "AbortError";
        return abortError;
    }
    const abortError = new Error("Request aborted");
    abortError.name = "AbortError";
    return abortError;
}

const NODEJS_TIMEOUT_ERROR_CODES = ["ECONNRESET", "EPIPE", "ETIMEDOUT"];

const getTransformedHeaders = (headers) => {
    const transformedHeaders = {};
    for (const name in headers) {
        const headerValues = headers[name];
        transformedHeaders[name] = Array.isArray(headerValues) ? headerValues.join(",") : headerValues;
    }
    return transformedHeaders;
};

const timing = {
    setTimeout: (cb, ms) => setTimeout(cb, ms),
    clearTimeout: (timeoutId) => clearTimeout(timeoutId),
};

const DEFER_EVENT_LISTENER_TIME$2 = 1000;
const setConnectionTimeout = (request, reject, timeoutInMs = 0) => {
    if (!timeoutInMs) {
        return -1;
    }
    const registerTimeout = (offset) => {
        const timeoutId = timing.setTimeout(() => {
            request.destroy();
            reject(Object.assign(new Error(`@smithy/node-http-handler - the request socket did not establish a connection with the server within the configured timeout of ${timeoutInMs} ms.`), {
                name: "TimeoutError",
            }));
        }, timeoutInMs - offset);
        const doWithSocket = (socket) => {
            if (socket?.connecting) {
                socket.on("connect", () => {
                    timing.clearTimeout(timeoutId);
                });
            }
            else {
                timing.clearTimeout(timeoutId);
            }
        };
        if (request.socket) {
            doWithSocket(request.socket);
        }
        else {
            request.on("socket", doWithSocket);
        }
    };
    if (timeoutInMs < 2000) {
        registerTimeout(0);
        return 0;
    }
    return timing.setTimeout(registerTimeout.bind(null, DEFER_EVENT_LISTENER_TIME$2), DEFER_EVENT_LISTENER_TIME$2);
};

const setRequestTimeout = (req, reject, timeoutInMs = 0, throwOnRequestTimeout, logger) => {
    if (timeoutInMs) {
        return timing.setTimeout(() => {
            let msg = `@smithy/node-http-handler - [${throwOnRequestTimeout ? "ERROR" : "WARN"}] a request has exceeded the configured ${timeoutInMs} ms requestTimeout.`;
            if (throwOnRequestTimeout) {
                const error = Object.assign(new Error(msg), {
                    name: "TimeoutError",
                    code: "ETIMEDOUT",
                });
                req.destroy(error);
                reject(error);
            }
            else {
                msg += ` Init client requestHandler with throwOnRequestTimeout=true to turn this into an error.`;
                logger?.warn?.(msg);
            }
        }, timeoutInMs);
    }
    return -1;
};

const DEFER_EVENT_LISTENER_TIME$1 = 3000;
const setSocketKeepAlive = (request, { keepAlive, keepAliveMsecs }, deferTimeMs = DEFER_EVENT_LISTENER_TIME$1) => {
    if (keepAlive !== true) {
        return -1;
    }
    const registerListener = () => {
        if (request.socket) {
            request.socket.setKeepAlive(keepAlive, keepAliveMsecs || 0);
        }
        else {
            request.on("socket", (socket) => {
                socket.setKeepAlive(keepAlive, keepAliveMsecs || 0);
            });
        }
    };
    if (deferTimeMs === 0) {
        registerListener();
        return 0;
    }
    return timing.setTimeout(registerListener, deferTimeMs);
};

const DEFER_EVENT_LISTENER_TIME = 3000;
const setSocketTimeout = (request, reject, timeoutInMs = 0) => {
    const registerTimeout = (offset) => {
        const timeout = timeoutInMs - offset;
        const onTimeout = () => {
            request.destroy();
            reject(Object.assign(new Error(`@smithy/node-http-handler - the request socket timed out after ${timeoutInMs} ms of inactivity (configured by client requestHandler).`), { name: "TimeoutError" }));
        };
        if (request.socket) {
            request.socket.setTimeout(timeout, onTimeout);
            request.on("close", () => request.socket?.removeListener("timeout", onTimeout));
        }
        else {
            request.setTimeout(timeout, onTimeout);
        }
    };
    if (0 < timeoutInMs && timeoutInMs < 6000) {
        registerTimeout(0);
        return 0;
    }
    return timing.setTimeout(registerTimeout.bind(null, timeoutInMs === 0 ? 0 : DEFER_EVENT_LISTENER_TIME), DEFER_EVENT_LISTENER_TIME);
};

const MIN_WAIT_TIME = 6_000;
async function writeRequestBody(httpRequest, request, maxContinueTimeoutMs = MIN_WAIT_TIME, externalAgent = false) {
    const headers = request.headers;
    const expect = headers ? headers.Expect || headers.expect : undefined;
    let timeoutId = -1;
    let sendBody = true;
    if (!externalAgent && expect === "100-continue") {
        sendBody = await Promise.race([
            new Promise((resolve) => {
                timeoutId = Number(timing.setTimeout(() => resolve(true), Math.max(MIN_WAIT_TIME, maxContinueTimeoutMs)));
            }),
            new Promise((resolve) => {
                httpRequest.on("continue", () => {
                    timing.clearTimeout(timeoutId);
                    resolve(true);
                });
                httpRequest.on("response", () => {
                    timing.clearTimeout(timeoutId);
                    resolve(false);
                });
                httpRequest.on("error", () => {
                    timing.clearTimeout(timeoutId);
                    resolve(false);
                });
            }),
        ]);
    }
    if (sendBody) {
        writeBody(httpRequest, request.body);
    }
}
function writeBody(httpRequest, body) {
    if (body instanceof node_stream.Readable) {
        body.pipe(httpRequest);
        return;
    }
    if (body) {
        const isBuffer = Buffer.isBuffer(body);
        const isString = typeof body === "string";
        if (isBuffer || isString) {
            if (isBuffer && body.byteLength === 0) {
                httpRequest.end();
            }
            else {
                httpRequest.end(body);
            }
            return;
        }
        const uint8 = body;
        if (typeof uint8 === "object" &&
            uint8.buffer &&
            typeof uint8.byteOffset === "number" &&
            typeof uint8.byteLength === "number") {
            httpRequest.end(Buffer.from(uint8.buffer, uint8.byteOffset, uint8.byteLength));
            return;
        }
        httpRequest.end(Buffer.from(body));
        return;
    }
    httpRequest.end();
}

const DEFAULT_REQUEST_TIMEOUT = 0;
let hAgent = undefined;
let hRequest = undefined;
class NodeHttpHandler {
    config;
    configProvider;
    socketWarningTimestamp = 0;
    externalAgent = false;
    metadata = { handlerProtocol: "http/1.1" };
    static create(instanceOrOptions) {
        if (typeof instanceOrOptions?.handle === "function") {
            return instanceOrOptions;
        }
        return new NodeHttpHandler(instanceOrOptions);
    }
    static checkSocketUsage(agent, socketWarningTimestamp, logger = console) {
        const { sockets, requests, maxSockets } = agent;
        if (typeof maxSockets !== "number" || maxSockets === Infinity) {
            return socketWarningTimestamp;
        }
        const interval = 15_000;
        if (Date.now() - interval < socketWarningTimestamp) {
            return socketWarningTimestamp;
        }
        if (sockets && requests) {
            for (const origin in sockets) {
                const socketsInUse = sockets[origin]?.length ?? 0;
                const requestsEnqueued = requests[origin]?.length ?? 0;
                if (socketsInUse >= maxSockets && requestsEnqueued >= 2 * maxSockets) {
                    logger?.warn?.(`@smithy/node-http-handler:WARN - socket usage at capacity=${socketsInUse} and ${requestsEnqueued} additional requests are enqueued.
See https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/node-configuring-maxsockets.html
or increase socketAcquisitionWarningTimeout=(millis) in the NodeHttpHandler config.`);
                    return Date.now();
                }
            }
        }
        return socketWarningTimestamp;
    }
    constructor(options) {
        this.configProvider = new Promise((resolve, reject) => {
            if (typeof options === "function") {
                options()
                    .then((_options) => {
                    resolve(this.resolveDefaultConfig(_options));
                })
                    .catch(reject);
            }
            else {
                resolve(this.resolveDefaultConfig(options));
            }
        });
    }
    destroy() {
        this.config?.httpAgent?.destroy();
        this.config?.httpsAgent?.destroy();
    }
    async handle(request, { abortSignal, requestTimeout } = {}) {
        if (!this.config) {
            this.config = await this.configProvider;
        }
        const config = this.config;
        const isSSL = request.protocol === "https:";
        if (!isSSL && !this.config.httpAgent) {
            this.config.httpAgent = await this.config.httpAgentProvider();
        }
        return new Promise((_resolve, _reject) => {
            let writeRequestBodyPromise = undefined;
            let socketWarningTimeoutId = -1;
            let connectionTimeoutId = -1;
            let requestTimeoutId = -1;
            let socketTimeoutId = -1;
            let keepAliveTimeoutId = -1;
            const clearTimeouts = () => {
                timing.clearTimeout(socketWarningTimeoutId);
                timing.clearTimeout(connectionTimeoutId);
                timing.clearTimeout(requestTimeoutId);
                timing.clearTimeout(socketTimeoutId);
                timing.clearTimeout(keepAliveTimeoutId);
            };
            const resolve = async (arg) => {
                await writeRequestBodyPromise;
                clearTimeouts();
                _resolve(arg);
            };
            const reject = async (arg) => {
                await writeRequestBodyPromise;
                clearTimeouts();
                _reject(arg);
            };
            if (abortSignal?.aborted) {
                const abortError = buildAbortError(abortSignal);
                reject(abortError);
                return;
            }
            const headers = request.headers;
            const expectContinue = headers ? (headers.Expect ?? headers.expect) === "100-continue" : false;
            let agent = isSSL ? config.httpsAgent : config.httpAgent;
            if (expectContinue && !this.externalAgent) {
                agent = new (isSSL ? node_https.Agent : hAgent)({
                    keepAlive: false,
                    maxSockets: Infinity,
                });
            }
            socketWarningTimeoutId = timing.setTimeout(() => {
                this.socketWarningTimestamp = NodeHttpHandler.checkSocketUsage(agent, this.socketWarningTimestamp, config.logger);
            }, config.socketAcquisitionWarningTimeout ?? (config.requestTimeout ?? 2000) + (config.connectionTimeout ?? 1000));
            const queryString = request.query ? protocols.buildQueryString(request.query) : "";
            let auth = undefined;
            if (request.username != null || request.password != null) {
                const username = request.username ?? "";
                const password = request.password ?? "";
                auth = `${username}:${password}`;
            }
            let path = request.path;
            if (queryString) {
                path += `?${queryString}`;
            }
            if (request.fragment) {
                path += `#${request.fragment}`;
            }
            let hostname = request.hostname ?? "";
            if (hostname[0] === "[" && hostname.endsWith("]")) {
                hostname = request.hostname.slice(1, -1);
            }
            else {
                hostname = request.hostname;
            }
            const nodeHttpsOptions = {
                headers: request.headers,
                host: hostname,
                method: request.method,
                path,
                port: request.port,
                agent,
                auth,
            };
            const requestFunc = isSSL ? node_https.request : hRequest;
            const req = requestFunc(nodeHttpsOptions, (res) => {
                const httpResponse = new protocols.HttpResponse({
                    statusCode: res.statusCode || -1,
                    reason: res.statusMessage,
                    headers: getTransformedHeaders(res.headers),
                    body: res,
                });
                resolve({ response: httpResponse });
            });
            req.on("error", (err) => {
                if (NODEJS_TIMEOUT_ERROR_CODES.includes(err.code)) {
                    reject(Object.assign(err, { name: "TimeoutError" }));
                }
                else {
                    reject(err);
                }
            });
            if (abortSignal) {
                const onAbort = () => {
                    req.destroy();
                    const abortError = buildAbortError(abortSignal);
                    reject(abortError);
                };
                if (typeof abortSignal.addEventListener === "function") {
                    const signal = abortSignal;
                    signal.addEventListener("abort", onAbort, { once: true });
                    req.once("close", () => signal.removeEventListener("abort", onAbort));
                }
                else {
                    abortSignal.onabort = onAbort;
                }
            }
            const effectiveRequestTimeout = requestTimeout ?? config.requestTimeout;
            connectionTimeoutId = setConnectionTimeout(req, reject, config.connectionTimeout);
            requestTimeoutId = setRequestTimeout(req, reject, effectiveRequestTimeout, config.throwOnRequestTimeout, config.logger ?? console);
            socketTimeoutId = setSocketTimeout(req, reject, config.socketTimeout);
            const httpAgent = nodeHttpsOptions.agent;
            if (typeof httpAgent === "object" && "keepAlive" in httpAgent) {
                keepAliveTimeoutId = setSocketKeepAlive(req, {
                    keepAlive: httpAgent.keepAlive,
                    keepAliveMsecs: httpAgent.keepAliveMsecs,
                });
            }
            writeRequestBodyPromise = writeRequestBody(req, request, effectiveRequestTimeout, this.externalAgent).catch((e) => {
                clearTimeouts();
                return _reject(e);
            });
        });
    }
    updateHttpClientConfig(key, value) {
        this.config = undefined;
        this.configProvider = this.configProvider.then((config) => {
            return {
                ...config,
                [key]: value,
            };
        });
    }
    httpHandlerConfigs() {
        return this.config ?? {};
    }
    resolveDefaultConfig(options) {
        const { requestTimeout, connectionTimeout, socketTimeout, socketAcquisitionWarningTimeout, httpAgent, httpsAgent, throwOnRequestTimeout, logger, } = options || {};
        const keepAlive = true;
        const maxSockets = 50;
        return {
            connectionTimeout,
            requestTimeout,
            socketTimeout,
            socketAcquisitionWarningTimeout,
            throwOnRequestTimeout,
            httpAgentProvider: async () => {
                const node_http = await Promise.resolve(/* import() */).then(__webpack_require__.t.bind(__webpack_require__, 37067, 23));
                const { Agent, request } = node_http.default ?? node_http;
                hRequest = request;
                hAgent = Agent;
                if (httpAgent instanceof hAgent || typeof httpAgent?.destroy === "function") {
                    this.externalAgent = true;
                    return httpAgent;
                }
                return new hAgent({ keepAlive, maxSockets, ...httpAgent });
            },
            httpsAgent: (() => {
                if (httpsAgent instanceof node_https.Agent || typeof httpsAgent?.destroy === "function") {
                    this.externalAgent = true;
                    return httpsAgent;
                }
                return new node_https.Agent({ keepAlive, maxSockets, ...httpsAgent });
            })(),
            logger,
        };
    }
}

const ids = new Uint16Array(1);
class ClientHttp2SessionRef {
    id = ids[0]++;
    total = 0;
    max = 0;
    session;
    refs = 0;
    constructor(session) {
        session.unref();
        this.session = session;
    }
    retain() {
        if (this.session.destroyed) {
            throw new Error("@smithy/node-http-handler - cannot acquire reference to destroyed session.");
        }
        this.refs += 1;
        this.total += 1;
        this.max = Math.max(this.refs, this.max);
        this.session.ref();
    }
    free() {
        if (this.session.destroyed) {
            return;
        }
        this.refs -= 1;
        if (this.refs === 0) {
            this.session.unref();
        }
        if (this.refs < 0) {
            throw new Error("@smithy/node-http-handler - ClientHttp2Session refcount at zero, cannot decrement.");
        }
    }
    deref() {
        return this.session;
    }
    close() {
        if (!this.session.closed) {
            this.session.close();
        }
    }
    destroy() {
        this.refs = 0;
        if (!this.session.destroyed) {
            this.session.destroy();
        }
    }
    useCount() {
        return this.refs;
    }
}

class NodeHttp2ConnectionPool {
    sessions = [];
    maxConcurrency = 0;
    constructor(sessions) {
        this.sessions = (sessions ?? []).map((session) => new ClientHttp2SessionRef(session));
    }
    poll() {
        let cleanup = false;
        for (const session of this.sessions) {
            if (session.deref().destroyed) {
                cleanup = true;
                continue;
            }
            if (!this.maxConcurrency || session.useCount() < this.maxConcurrency) {
                return session;
            }
        }
        if (cleanup) {
            for (const session of this.sessions) {
                if (session.deref().destroyed) {
                    this.remove(session);
                }
            }
        }
    }
    offerLast(ref) {
        this.sessions.push(ref);
    }
    remove(ref) {
        const ix = this.sessions.indexOf(ref);
        if (ix > -1) {
            this.sessions.splice(ix, 1);
        }
    }
    [Symbol.iterator]() {
        return this.sessions[Symbol.iterator]();
    }
    setMaxConcurrency(maxConcurrency) {
        this.maxConcurrency = maxConcurrency;
    }
    destroy(ref) {
        this.remove(ref);
        ref.destroy();
    }
}

class NodeHttp2ConnectionManager {
    config;
    connectOptions;
    connectionPools = new Map();
    constructor(config) {
        this.config = config;
        if (this.config.maxConcurrency && this.config.maxConcurrency <= 0) {
            throw new RangeError("maxConcurrency must be greater than zero.");
        }
    }
    lease(requestContext, connectionConfiguration) {
        const url = this.getUrlString(requestContext);
        const pool = this.getPool(url);
        if (!this.config.disableConcurrency && !connectionConfiguration.isEventStream) {
            const available = pool.poll();
            if (available) {
                available.retain();
                return available;
            }
        }
        const ref = new ClientHttp2SessionRef(this.connect(url));
        const session = ref.deref();
        if (this.config.maxConcurrency) {
            session.settings({ maxConcurrentStreams: this.config.maxConcurrency }, (err) => {
                if (err) {
                    throw new Error("Fail to set maxConcurrentStreams to " +
                        this.config.maxConcurrency +
                        "when creating new session for " +
                        requestContext.destination.toString());
                }
            });
        }
        const graceful = () => {
            this.removeFromPoolAndClose(url, ref);
        };
        const ensureDestroyed = () => {
            this.removeFromPoolAndCheckedDestroy(url, ref);
        };
        session.on("goaway", graceful);
        session.on("error", ensureDestroyed);
        session.on("frameError", ensureDestroyed);
        session.on("close", ensureDestroyed);
        if (connectionConfiguration.requestTimeout) {
            session.setTimeout(connectionConfiguration.requestTimeout, ensureDestroyed);
        }
        pool.offerLast(ref);
        ref.retain();
        return ref;
    }
    release(_requestContext, ref) {
        ref.free();
    }
    createIsolatedSession(requestContext, connectionConfiguration) {
        const url = this.getUrlString(requestContext);
        const ref = new ClientHttp2SessionRef(this.connect(url));
        const session = ref.deref();
        session.settings({ maxConcurrentStreams: 1 });
        const ensureDestroyed = () => {
            ref.destroy();
        };
        session.on("error", ensureDestroyed);
        session.on("frameError", ensureDestroyed);
        session.on("close", ensureDestroyed);
        if (connectionConfiguration.requestTimeout) {
            session.setTimeout(connectionConfiguration.requestTimeout, ensureDestroyed);
        }
        ref.retain();
        return ref;
    }
    destroy() {
        for (const [url, connectionPool] of this.connectionPools) {
            for (const session of [...connectionPool]) {
                session.destroy();
            }
            this.connectionPools.delete(url);
        }
    }
    setMaxConcurrentStreams(maxConcurrentStreams) {
        if (maxConcurrentStreams && maxConcurrentStreams <= 0) {
            throw new RangeError("maxConcurrentStreams must be greater than zero.");
        }
        this.config.maxConcurrency = maxConcurrentStreams;
        for (const pool of this.connectionPools.values()) {
            pool.setMaxConcurrency(maxConcurrentStreams);
        }
    }
    setDisableConcurrentStreams(disableConcurrentStreams) {
        this.config.disableConcurrency = disableConcurrentStreams;
    }
    setNodeHttp2ConnectOptions(nodeHttp2ConnectOptions) {
        this.connectOptions = nodeHttp2ConnectOptions;
    }
    debug() {
        const pools = {};
        for (const [url, pool] of this.connectionPools) {
            const sessions = [];
            for (const ref of pool) {
                sessions.push({
                    id: ref.id,
                    active: ref.useCount(),
                    maxConcurrent: ref.max,
                    totalRequests: ref.total,
                });
            }
            pools[url] = { sessions };
        }
        return pools;
    }
    removeFromPoolAndClose(authority, ref) {
        this.connectionPools.get(authority)?.remove(ref);
        ref.close();
    }
    removeFromPoolAndCheckedDestroy(authority, ref) {
        this.connectionPools.get(authority)?.remove(ref);
        ref.destroy();
    }
    getPool(url) {
        if (!this.connectionPools.has(url)) {
            const pool = new NodeHttp2ConnectionPool();
            if (this.config.maxConcurrency) {
                pool.setMaxConcurrency(this.config.maxConcurrency);
            }
            this.connectionPools.set(url, pool);
        }
        return this.connectionPools.get(url);
    }
    getUrlString(request) {
        return request.destination.toString();
    }
    connect(url) {
        return this.connectOptions === undefined ? http2.connect(url) : http2.connect(url, this.connectOptions);
    }
}

const { constants } = http2;
class NodeHttp2Handler {
    config;
    configProvider;
    metadata = { handlerProtocol: "h2" };
    connectionManager = new NodeHttp2ConnectionManager({});
    static create(instanceOrOptions) {
        if (typeof instanceOrOptions?.handle === "function") {
            return instanceOrOptions;
        }
        return new NodeHttp2Handler(instanceOrOptions);
    }
    constructor(options) {
        this.configProvider = new Promise((resolve, reject) => {
            if (typeof options === "function") {
                options()
                    .then((opts) => {
                    resolve(opts || {});
                })
                    .catch(reject);
            }
            else {
                resolve(options || {});
            }
        });
    }
    destroy() {
        this.connectionManager.destroy();
    }
    async handle(request, { abortSignal, requestTimeout, isEventStream } = {}) {
        if (!this.config) {
            this.config = await this.configProvider;
            const { disableConcurrentStreams, maxConcurrentStreams, nodeHttp2ConnectOptions } = this.config;
            this.connectionManager.setDisableConcurrentStreams(disableConcurrentStreams ?? false);
            if (maxConcurrentStreams) {
                this.connectionManager.setMaxConcurrentStreams(maxConcurrentStreams);
            }
            if (nodeHttp2ConnectOptions) {
                this.connectionManager.setNodeHttp2ConnectOptions(nodeHttp2ConnectOptions);
            }
        }
        const { requestTimeout: configRequestTimeout, disableConcurrentStreams } = this.config;
        const useIsolatedSession = disableConcurrentStreams || isEventStream;
        const effectiveRequestTimeout = requestTimeout ?? configRequestTimeout;
        return new Promise((_resolve, _reject) => {
            let fulfilled = false;
            let writeRequestBodyPromise = undefined;
            const resolve = async (arg) => {
                await writeRequestBodyPromise;
                _resolve(arg);
            };
            const reject = async (arg) => {
                await writeRequestBodyPromise;
                _reject(arg);
            };
            if (abortSignal?.aborted) {
                fulfilled = true;
                const abortError = buildAbortError(abortSignal);
                reject(abortError);
                return;
            }
            const { hostname, method, port, protocol, query } = request;
            let auth = "";
            if (request.username != null || request.password != null) {
                const username = request.username ?? "";
                const password = request.password ?? "";
                auth = `${username}:${password}@`;
            }
            const authority = `${protocol}//${auth}${hostname}${port ? `:${port}` : ""}`;
            const requestContext = { destination: new URL(authority) };
            const connectConfig = {
                requestTimeout: this.config?.sessionTimeout,
                isEventStream,
            };
            const ref = useIsolatedSession
                ? this.connectionManager.createIsolatedSession(requestContext, connectConfig)
                : this.connectionManager.lease(requestContext, connectConfig);
            const session = ref.deref();
            const rejectWithDestroy = (err) => {
                if (useIsolatedSession) {
                    ref.destroy();
                }
                fulfilled = true;
                reject(err);
            };
            const queryString = query ? protocols.buildQueryString(query) : "";
            let path = request.path;
            if (queryString) {
                path += `?${queryString}`;
            }
            if (request.fragment) {
                path += `#${request.fragment}`;
            }
            const clientHttp2Stream = session.request({
                ...request.headers,
                [constants.HTTP2_HEADER_PATH]: path,
                [constants.HTTP2_HEADER_METHOD]: method,
            });
            if (effectiveRequestTimeout) {
                clientHttp2Stream.setTimeout(effectiveRequestTimeout, () => {
                    clientHttp2Stream.close();
                    const timeoutError = new Error(`Stream timed out because of no activity for ${effectiveRequestTimeout} ms`);
                    timeoutError.name = "TimeoutError";
                    rejectWithDestroy(timeoutError);
                });
            }
            if (abortSignal) {
                const onAbort = () => {
                    clientHttp2Stream.close();
                    const abortError = buildAbortError(abortSignal);
                    rejectWithDestroy(abortError);
                };
                if (typeof abortSignal.addEventListener === "function") {
                    const signal = abortSignal;
                    signal.addEventListener("abort", onAbort, { once: true });
                    clientHttp2Stream.once("close", () => signal.removeEventListener("abort", onAbort));
                }
                else {
                    abortSignal.onabort = onAbort;
                }
            }
            clientHttp2Stream.on("frameError", (type, code, id) => {
                rejectWithDestroy(new Error(`Frame type id ${type} in stream id ${id} has failed with code ${code}.`));
            });
            clientHttp2Stream.on("error", rejectWithDestroy);
            clientHttp2Stream.on("aborted", () => {
                rejectWithDestroy(new Error(`HTTP/2 stream is abnormally aborted in mid-communication with result code ${clientHttp2Stream.rstCode}.`));
            });
            clientHttp2Stream.on("response", (headers) => {
                const httpResponse = new protocols.HttpResponse({
                    statusCode: headers[":status"] ?? -1,
                    headers: getTransformedHeaders(headers),
                    body: clientHttp2Stream,
                });
                fulfilled = true;
                resolve({ response: httpResponse });
                if (useIsolatedSession) {
                    session.close();
                }
            });
            clientHttp2Stream.on("close", () => {
                if (useIsolatedSession) {
                    ref.destroy();
                }
                else {
                    this.connectionManager.release(requestContext, ref);
                }
                if (!fulfilled) {
                    rejectWithDestroy(new Error("Unexpected error: http2 request did not get a response"));
                }
            });
            writeRequestBodyPromise = writeRequestBody(clientHttp2Stream, request, effectiveRequestTimeout);
        });
    }
    updateHttpClientConfig(key, value) {
        this.config = undefined;
        this.configProvider = this.configProvider.then((config) => {
            return {
                ...config,
                [key]: value,
            };
        });
    }
    httpHandlerConfigs() {
        return this.config ?? {};
    }
}

class Collector extends node_stream.Writable {
    bufferedBytes = [];
    _write(chunk, encoding, callback) {
        this.bufferedBytes.push(chunk);
        callback();
    }
}

const streamCollector = (stream) => {
    if (isReadableStreamInstance(stream)) {
        return collectReadableStream(stream);
    }
    return new Promise((resolve, reject) => {
        const collector = new Collector();
        stream.pipe(collector);
        stream.on("error", (err) => {
            collector.end();
            reject(err);
        });
        collector.on("error", reject);
        collector.on("finish", function () {
            const bytes = new Uint8Array(Buffer.concat(this.bufferedBytes));
            resolve(bytes);
        });
    });
};
const isReadableStreamInstance = (stream) => typeof ReadableStream === "function" && stream instanceof ReadableStream;
async function collectReadableStream(stream) {
    const chunks = [];
    const reader = stream.getReader();
    let isDone = false;
    let length = 0;
    while (!isDone) {
        const { done, value } = await reader.read();
        if (value) {
            chunks.push(value);
            length += value.length;
        }
        isDone = done;
    }
    const collected = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        collected.set(chunk, offset);
        offset += chunk.length;
    }
    return collected;
}

exports.DEFAULT_REQUEST_TIMEOUT = DEFAULT_REQUEST_TIMEOUT;
exports.NodeHttp2Handler = NodeHttp2Handler;
exports.NodeHttpHandler = NodeHttpHandler;
exports.streamCollector = streamCollector;


/***/ }),

/***/ 60615:
/***/ ((module) => {

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global global, define, Symbol, Reflect, Promise, SuppressedError, Iterator */
var __extends;
var __assign;
var __rest;
var __decorate;
var __param;
var __esDecorate;
var __runInitializers;
var __propKey;
var __setFunctionName;
var __metadata;
var __awaiter;
var __generator;
var __exportStar;
var __values;
var __read;
var __spread;
var __spreadArrays;
var __spreadArray;
var __await;
var __asyncGenerator;
var __asyncDelegator;
var __asyncValues;
var __makeTemplateObject;
var __importStar;
var __importDefault;
var __classPrivateFieldGet;
var __classPrivateFieldSet;
var __classPrivateFieldIn;
var __createBinding;
var __addDisposableResource;
var __disposeResources;
var __rewriteRelativeImportExtension;
(function (factory) {
    var root = typeof global === "object" ? global : typeof self === "object" ? self : typeof this === "object" ? this : {};
    if (typeof define === "function" && define.amd) {
        define("tslib", ["exports"], function (exports) { factory(createExporter(root, createExporter(exports))); });
    }
    else if ( true && typeof module.exports === "object") {
        factory(createExporter(root, createExporter(module.exports)));
    }
    else {
        factory(createExporter(root));
    }
    function createExporter(exports, previous) {
        if (exports !== root) {
            if (typeof Object.create === "function") {
                Object.defineProperty(exports, "__esModule", { value: true });
            }
            else {
                exports.__esModule = true;
            }
        }
        return function (id, v) { return exports[id] = previous ? previous(id, v) : v; };
    }
})
(function (exporter) {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };

    __extends = function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };

    __assign = Object.assign || function (t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
    };

    __rest = function (s, e) {
        var t = {};
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
            t[p] = s[p];
        if (s != null && typeof Object.getOwnPropertySymbols === "function")
            for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
                if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                    t[p[i]] = s[p[i]];
            }
        return t;
    };

    __decorate = function (decorators, target, key, desc) {
        var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
        if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
        else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
        return c > 3 && r && Object.defineProperty(target, key, r), r;
    };

    __param = function (paramIndex, decorator) {
        return function (target, key) { decorator(target, key, paramIndex); }
    };

    __esDecorate = function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
        function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
        var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
        var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
        var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
        var _, done = false;
        for (var i = decorators.length - 1; i >= 0; i--) {
            var context = {};
            for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
            for (var p in contextIn.access) context.access[p] = contextIn.access[p];
            context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
            var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
            if (kind === "accessor") {
                if (result === void 0) continue;
                if (result === null || typeof result !== "object") throw new TypeError("Object expected");
                if (_ = accept(result.get)) descriptor.get = _;
                if (_ = accept(result.set)) descriptor.set = _;
                if (_ = accept(result.init)) initializers.unshift(_);
            }
            else if (_ = accept(result)) {
                if (kind === "field") initializers.unshift(_);
                else descriptor[key] = _;
            }
        }
        if (target) Object.defineProperty(target, contextIn.name, descriptor);
        done = true;
    };

    __runInitializers = function (thisArg, initializers, value) {
        var useValue = arguments.length > 2;
        for (var i = 0; i < initializers.length; i++) {
            value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
        }
        return useValue ? value : void 0;
    };

    __propKey = function (x) {
        return typeof x === "symbol" ? x : "".concat(x);
    };

    __setFunctionName = function (f, name, prefix) {
        if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
        return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
    };

    __metadata = function (metadataKey, metadataValue) {
        if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
    };

    __awaiter = function (thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    };

    __generator = function (thisArg, body) {
        var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
        return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
        function verb(n) { return function (v) { return step([n, v]); }; }
        function step(op) {
            if (f) throw new TypeError("Generator is already executing.");
            while (g && (g = 0, op[0] && (_ = 0)), _) try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
                if (y = 0, t) op = [op[0] & 2, t.value];
                switch (op[0]) {
                    case 0: case 1: t = op; break;
                    case 4: _.label++; return { value: op[1], done: false };
                    case 5: _.label++; y = op[1]; op = [0]; continue;
                    case 7: op = _.ops.pop(); _.trys.pop(); continue;
                    default:
                        if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                        if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                        if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                        if (t[2]) _.ops.pop();
                        _.trys.pop(); continue;
                }
                op = body.call(thisArg, _);
            } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
            if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
        }
    };

    __exportStar = function(m, o) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(o, p)) __createBinding(o, m, p);
    };

    __createBinding = Object.create ? (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
            desc = { enumerable: true, get: function() { return m[k]; } };
        }
        Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
    });

    __values = function (o) {
        var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
        if (m) return m.call(o);
        if (o && typeof o.length === "number") return {
            next: function () {
                if (o && i >= o.length) o = void 0;
                return { value: o && o[i++], done: !o };
            }
        };
        throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
    };

    __read = function (o, n) {
        var m = typeof Symbol === "function" && o[Symbol.iterator];
        if (!m) return o;
        var i = m.call(o), r, ar = [], e;
        try {
            while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
        }
        catch (error) { e = { error: error }; }
        finally {
            try {
                if (r && !r.done && (m = i["return"])) m.call(i);
            }
            finally { if (e) throw e.error; }
        }
        return ar;
    };

    /** @deprecated */
    __spread = function () {
        for (var ar = [], i = 0; i < arguments.length; i++)
            ar = ar.concat(__read(arguments[i]));
        return ar;
    };

    /** @deprecated */
    __spreadArrays = function () {
        for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
        for (var r = Array(s), k = 0, i = 0; i < il; i++)
            for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
                r[k] = a[j];
        return r;
    };

    __spreadArray = function (to, from, pack) {
        if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
            if (ar || !(i in from)) {
                if (!ar) ar = Array.prototype.slice.call(from, 0, i);
                ar[i] = from[i];
            }
        }
        return to.concat(ar || Array.prototype.slice.call(from));
    };

    __await = function (v) {
        return this instanceof __await ? (this.v = v, this) : new __await(v);
    };

    __asyncGenerator = function (thisArg, _arguments, generator) {
        if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
        var g = generator.apply(thisArg, _arguments || []), i, q = [];
        return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
        function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
        function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
        function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
        function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
        function fulfill(value) { resume("next", value); }
        function reject(value) { resume("throw", value); }
        function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
    };

    __asyncDelegator = function (o) {
        var i, p;
        return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
        function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await(o[n](v)), done: false } : f ? f(v) : v; } : f; }
    };

    __asyncValues = function (o) {
        if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
        var m = o[Symbol.asyncIterator], i;
        return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
        function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
        function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
    };

    __makeTemplateObject = function (cooked, raw) {
        if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
        return cooked;
    };

    var __setModuleDefault = Object.create ? (function(o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
        o["default"] = v;
    };

    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };

    __importStar = function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };

    __importDefault = function (mod) {
        return (mod && mod.__esModule) ? mod : { "default": mod };
    };

    __classPrivateFieldGet = function (receiver, state, kind, f) {
        if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
        if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
        return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
    };

    __classPrivateFieldSet = function (receiver, state, value, kind, f) {
        if (kind === "m") throw new TypeError("Private method is not writable");
        if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
        if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
        return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
    };

    __classPrivateFieldIn = function (state, receiver) {
        if (receiver === null || (typeof receiver !== "object" && typeof receiver !== "function")) throw new TypeError("Cannot use 'in' operator on non-object");
        return typeof state === "function" ? receiver === state : state.has(receiver);
    };

    __addDisposableResource = function (env, value, async) {
        if (value !== null && value !== void 0) {
            if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
            var dispose, inner;
            if (async) {
                if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
                dispose = value[Symbol.asyncDispose];
            }
            if (dispose === void 0) {
                if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
                dispose = value[Symbol.dispose];
                if (async) inner = dispose;
            }
            if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
            if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
            env.stack.push({ value: value, dispose: dispose, async: async });
        }
        else if (async) {
            env.stack.push({ async: true });
        }
        return value;
    };

    var _SuppressedError = typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
        var e = new Error(message);
        return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
    };

    __disposeResources = function (env) {
        function fail(e) {
            env.error = env.hasError ? new _SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };

    __rewriteRelativeImportExtension = function (path, preserveJsx) {
        if (typeof path === "string" && /^\.\.?\//.test(path)) {
            return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
                return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
            });
        }
        return path;
    };

    exporter("__extends", __extends);
    exporter("__assign", __assign);
    exporter("__rest", __rest);
    exporter("__decorate", __decorate);
    exporter("__param", __param);
    exporter("__esDecorate", __esDecorate);
    exporter("__runInitializers", __runInitializers);
    exporter("__propKey", __propKey);
    exporter("__setFunctionName", __setFunctionName);
    exporter("__metadata", __metadata);
    exporter("__awaiter", __awaiter);
    exporter("__generator", __generator);
    exporter("__exportStar", __exportStar);
    exporter("__createBinding", __createBinding);
    exporter("__values", __values);
    exporter("__read", __read);
    exporter("__spread", __spread);
    exporter("__spreadArrays", __spreadArrays);
    exporter("__spreadArray", __spreadArray);
    exporter("__await", __await);
    exporter("__asyncGenerator", __asyncGenerator);
    exporter("__asyncDelegator", __asyncDelegator);
    exporter("__asyncValues", __asyncValues);
    exporter("__makeTemplateObject", __makeTemplateObject);
    exporter("__importStar", __importStar);
    exporter("__importDefault", __importDefault);
    exporter("__classPrivateFieldGet", __classPrivateFieldGet);
    exporter("__classPrivateFieldSet", __classPrivateFieldSet);
    exporter("__classPrivateFieldIn", __classPrivateFieldIn);
    exporter("__addDisposableResource", __addDisposableResource);
    exporter("__disposeResources", __disposeResources);
    exporter("__rewriteRelativeImportExtension", __rewriteRelativeImportExtension);
});

0 && (0);


/***/ })

};
;