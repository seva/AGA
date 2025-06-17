// ==UserScript==
// @name         AGA Browser-Side Controller
// @namespace    http://tampermonkey.net/
// @version      3.2.3 // Agent will increment patch version upon successful code injection
// @description  Handles commands, including ::browser_code for self-modification via agent-based code injection and Tampermonkey updates.
// @author       AGA Developer
// @match        https://gemini.google.com/*
// @match        https://aistudio.google.com/chat/* 
// @grant        GM_xmlhttpRequest
// @grant        GM_log
// @connect      localhost
// @downloadURL  http://localhost:3000/browser_controller.user.js
// @updateURL    http://localhost:3000/browser_controller.user.js
// ==/UserScript==

(function() {
    'use strict';

    // --- GENERIC CORE LOGIC & CONSTANTS ---
    const COMMAND_PREFIX = "AGA::";
    const AGENT_URL = "http://localhost:3000/command";
    const AGENT_INJECT_CODE_URL = "http://localhost:3000/inject_code";
    const BROWSER_CODE_COMMAND = "::browser_code";
    const SCRIPT_URL_FOR_UPDATE = "http://localhost:3000/browser_controller.user.js";

    // --- Custom Event Names ---
    const AGA_POTENTIAL_COMMAND_EVENT = "AgaPotentialCommandEvent";
    const AGA_NETWORK_RESPONSE_EVENT = "AgaNetworkResponseEvent"; // New generic event

    // --- Spinner Elements and Functions (Generic) ---
    let spinnerElement = null;

    function createSpinnerElement() {
        const svgNS = "http://www.w3.org/2000/svg";
        const spinnerDiv = document.createElement('div');
        spinnerDiv.setAttribute('id', 'aga-spinner');
        spinnerDiv.style.position = 'fixed';
        spinnerDiv.style.width = '24px';
        spinnerDiv.style.height = '24px';
        spinnerDiv.style.top = '10px';
        spinnerDiv.style.right = '10px';
        spinnerDiv.style.display = 'none';
        spinnerDiv.style.zIndex = '9999';

        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');

        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('cx', '12');
        circle.setAttribute('cy', '12');
        circle.setAttribute('r', '10');

        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', 'M12 2v4M12 18v4M4.22 4.22l2.83 2.83M16.97 16.97l2.83 2.83M2 12h4m14 0h4m-2.83-7.76l-2.83 2.83M4.22 16.97l2.83-2.83');

        svg.appendChild(circle);
        svg.appendChild(path);
        spinnerDiv.appendChild(svg);
        document.body.appendChild(spinnerDiv); // Append spinner to body once
        return spinnerDiv;
    }

    function showSpinner() {
        if (!spinnerElement) {
            spinnerElement = createSpinnerElement();
        }
        GM_log("AGA Controller: Showing spinner.");
        spinnerElement.style.display = 'block';
    }

    function hideSpinner() {
        if (!spinnerElement) {
            GM_log("AGA Controller: Spinner does not exist, cannot hide.");
            return;
        }
        GM_log("AGA Controller: Hiding spinner.");
        spinnerElement.style.display = 'none';
    }
    // --- End of Spinner Functions ---

    // --- Function to execute dynamically injected browser code (Generic) ---
    function executeDynamicallyInjectedBrowserCode() {
        GM_log("AGA Controller: Executing dynamically injected browser code block.");
        // --- INJECTED_BROWSER_CODE_START ---
console.log("New injected code ran successfully at " + new Date().toLocaleTimeString());
    // --- INJECTED_BROWSER_CODE_END ---
        GM_log("AGA Controller: Finished executing dynamically injected browser code block.");
    }

    // --- UI ADAPTERS ---
    const UIManager = {
        currentAdapter: null,
        adapters: {
            gemini: {
                name: "Gemini",
                match: (url) => url.hostname.includes("gemini.google.com"),
                selectors: {
                    messageContent: "message-content",
                    inputEditor: "div.ql-editor",
                    sendButton: "button.send-button",
                },
                networkTriggers: {
                    isPrimaryResponseStream: (url) => url.includes("/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate") || url.includes("/BardChatUi/data/batchexecute"),
                    isCompletionSignal: (url) => url.includes("/lamda/images/regenerate"),
                },
                state: {
                    isWaitingForCompletionSignal: false,
                    isCalmDownPeriodActive: false,
                    calmDownDurationMs: 2000,
                },
                initialize: function() {
                    GM_log(`AGA Controller: Initializing ${this.name} adapter.`);
                    this.state.isWaitingForCompletionSignal = false;
                    this.state.isCalmDownPeriodActive = false;
                    document.addEventListener(AGA_NETWORK_RESPONSE_EVENT, this.handleNetworkResponse.bind(this));
                },
                handleNetworkResponse: function(event) {
                    const { method, url, status } = event.detail;
                    let isReadyToProcess = false;

                    if (method === 'POST' && this.networkTriggers.isPrimaryResponseStream(url)) {
                        if (status === 200 && !this.state.isCalmDownPeriodActive) {
                            GM_log(`AGA Controller (${this.name}): Main content POST successful. Waiting for completion signal.`);
                            this.state.isWaitingForCompletionSignal = true;
                        } else if (status !== 200) {
                            GM_log(`AGA Controller (${this.name}): Main content POST not successful. Status: ${status}`);
                            this.state.isWaitingForCompletionSignal = false;
                        }
                    } else if (method === 'GET' && this.networkTriggers.isCompletionSignal(url)) {
                        if (this.state.isWaitingForCompletionSignal && status === 200) {
                            GM_log(`AGA Controller (${this.name}): Completion signal GET successful. Ready to process.`);
                            isReadyToProcess = true;
                            this.state.isWaitingForCompletionSignal = false; // Reset state
                            this.state.isCalmDownPeriodActive = true;
                            setTimeout(() => {
                                this.state.isCalmDownPeriodActive = false;
                                GM_log(`AGA Controller (${this.name}): Calm down period ended.`);
                            }, this.state.calmDownDurationMs);
                        } else if (status !== 200 && this.state.isWaitingForCompletionSignal) {
                             GM_log(`AGA Controller (${this.name}): Completion signal GET not successful (Status: ${status}). Resetting wait.`);
                             this.state.isWaitingForCompletionSignal = false;
                        }
                    }

                    if (!isReadyToProcess) {
                        // If not ready to process, ignore
                        return;
                    }
                    const text = this.getTextFromResponseElements();
                    if (!text) {
                        // If no text found, log and ignore
                        GM_log(`AGA Controller (${this.name}): No text found in response elements with selector: ${this.selectors.messageContent}`);
                        return;
                    }
                    GM_log(`AGA Controller (${this.name}): Dispatching ${AGA_POTENTIAL_COMMAND_EVENT} from adapter.`);
                    document.dispatchEvent(new CustomEvent(AGA_POTENTIAL_COMMAND_EVENT, { detail: { text: text } }));
                },
                getTextFromResponseElements: function() {
                    const messageElements = document.querySelectorAll(this.selectors.messageContent);
                    if (!messageElements.length) {
                        GM_log(`AGA Controller (${this.name}): No message elements found with selector: ${this.selectors.messageContent}`);
                        return "";
                    }
                    return messageElements[messageElements.length - 1].textContent || "";
                },
                injectTextAndClickSend: async function(textToInject) {
                    GM_log(`AGA Controller (${this.name}): Injecting text via adapter: "${String(textToInject).substring(0,50)}..."`);
                    showSpinner();
                    const editorElement = document.querySelector(this.selectors.inputEditor);
                    if (!editorElement) {
                        GM_log(`AGA Controller (${this.name}): Editor element not found with selector: ${this.selectors.inputEditor}`);
                        hideSpinner();
                        return;
                    }
                    editorElement.innerText = String(textToInject);
                    await new Promise(resolve => setTimeout(resolve, 200));
                    editorElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    editorElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                    await new Promise(resolve => setTimeout(resolve, 100));

                    const sendButtonElement = document.querySelector(this.selectors.sendButton);
                    if (!sendButtonElement) {
                        GM_log(`AGA Controller (${this.name}): Send button not found with selector: ${this.selectors.sendButton}`);
                        hideSpinner();
                        return;
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    sendButtonElement.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
                    await new Promise(resolve => setTimeout(resolve, 100));
                    sendButtonElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
                    await new Promise(resolve => setTimeout(resolve, 200));
                    sendButtonElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                    await new Promise(resolve => setTimeout(resolve, 100));
                    sendButtonElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                    await new Promise(resolve => setTimeout(resolve, 100));
                    sendButtonElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    GM_log(`AGA Controller (${this.name}): Simulated click sequence complete for injected text.`);
                    hideSpinner();
                }
            },
            aiStudio: { // Placeholder
                name: "AI Studio",
                match: (url) => url.hostname.includes("aistudio.google.com"),
                selectors: {
                    messageContent: ".turn-content",
                    inputEditor: "div.text-input-wrapper > > textarea",
                    sendButton: "button.run-button",
                },
                networkTriggers: {
                    isPrimaryResponseStream: (url) => url.includes("/GenerateContent"),
                    isCompletionSignal: (url) => url.includes("/CountTokens"),
                },
                state: {
                    isCalmDownPeriodActive: false,
                    calmDownDurationMs: 1500,
                },
                initialize: function() {
                    GM_log(`AGA Controller: Initializing ${this.name} adapter.`);
                    this.state.isCalmDownPeriodActive = false;
                    document.addEventListener(AGA_NETWORK_RESPONSE_EVENT, this.handleNetworkResponse.bind(this));
                },
                handleNetworkResponse: function(event) {
                    const { method, url, status } = event.detail;
                    if (method === 'POST' && this.networkTriggers.isPrimaryResponseStream(url) && status === 200 && !this.state.isCalmDownPeriodActive) {
                        GM_log(`AGA Controller (${this.name}): Response stream finished. Ready to process.`);
                        this.state.isCalmDownPeriodActive = true;
                        setTimeout(() => {
                            this.state.isCalmDownPeriodActive = false;
                            GM_log(`AGA Controller (${this.name}): Calm down period ended.`);
                        }, this.state.calmDownDurationMs);

                        const text = this.getTextFromResponseElements();
                        if (text) {
                            GM_log(`AGA Controller (${this.name}): Dispatching ${AGA_POTENTIAL_COMMAND_EVENT} from adapter.`);
                            document.dispatchEvent(new CustomEvent(AGA_POTENTIAL_COMMAND_EVENT, { detail: { text: text } }));
                        }
                    }
                },
                getTextFromResponseElements: function() {
                    // TODO: Implement AI Studio specific text extraction
                    const messageAreas = document.querySelectorAll(this.selectors.messageContent); // Example
                    if (!messageAreas.length) {
                        GM_log(`AGA Controller (${this.name}): No message elements found with selector: ${this.selectors.messageContent}`);
                        return "";
                    }
                    // Select the text content of the last message element
                    return messageAreas[messageAreas.length - 1].textContent.trim();
                },
                injectTextAndClickSend: async function(textToInject) {
                    // TODO: Implement AI Studio specific injection
                    GM_log(`AGA Controller (${this.name}): Injecting text via adapter: "${String(textToInject).substring(0,50)}..."`);
                    showSpinner();
                    const editorElement = document.querySelector(this.selectors.inputEditor);
                    if (!editorElement) {
                         GM_log(`AGA Controller (${this.name}): Editor element not found with selector: ${this.selectors.inputEditor}`);
                         hideSpinner();
                         return;
                    }
                    editorElement.value = String(textToInject);
                    editorElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    editorElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                    
                    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for UI to update

                    const sendButtonElement = document.querySelector(this.selectors.sendButton);
                    if (!sendButtonElement) {
                        GM_log(`AGA Controller (${this.name}): Send button not found with selector: ${this.selectors.sendButton}`);
                        hideSpinner();
                        return;
                    }
                    sendButtonElement.click();
                    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for action to process
                    hideSpinner();
                }
            }
        },
        selectAdapter: function() {
            const currentUrl = new URL(window.location.href);
            for (const key in this.adapters) {
                if (this.adapters[key].match(currentUrl)) {
                    this.currentAdapter = this.adapters[key];
                    GM_log(`AGA Controller: Selected UI adapter: ${this.currentAdapter.name}`);
                    this.currentAdapter.initialize(); // This will set up the event listener
                    return;
                }
            }
            GM_log("AGA Controller: No suitable UI adapter found for URL: " + window.location.href);
        }
    };

    // --- Generic Agent Communication Functions ---
    async function sendCommandToAgent(commandPayload, uiAdapter) {
        // Guard Clause: Validate commandPayload structure (moved from original global function)
        if (!commandPayload || typeof commandPayload !== 'object' ||
            typeof commandPayload.command !== 'string' ||
            (commandPayload.stdin !== undefined && typeof commandPayload.stdin !== 'string') ) { // stdin can be undefined
            GM_log("AGA Controller: Invalid command payload. Expected {command: string, stdin?: string}. Payload: " + JSON.stringify(commandPayload));
            await uiAdapter.injectTextAndClickSend("AGA Internal Error: Invalid payload structure before sending to agent.");
            return;
        }
        // Ensure stdin is a string if it's undefined (for GM_xmlhttpRequest data)
        const dataToSend = JSON.stringify({ ...commandPayload, stdin: commandPayload.stdin || "" });
        GM_log('AGA Controller: Preparing to send command object to Agent: ' + dataToSend);

        GM_xmlhttpRequest({
            method: "POST",
            url: AGENT_URL,
            headers: { "Content-Type": "application/json" },
            data: dataToSend,
            timeout: 60000,
            onload: async function(response) {
                let responseDataText = "AGA Error: Empty response from agent.";
                try {
                    const responseData = JSON.parse(response.responseText);
                    GM_log("AGA Controller: Agent responded: " + JSON.stringify(responseData));
                    responseDataText = JSON.stringify(responseData, null, 2);
                } catch (e) {
                    GM_log('AGA Controller: Error parsing Agent response: ' + e + '. Text: ' + response.responseText);
                    responseDataText = "AGA Error: Could not parse response from Local Agent. Raw response: " + response.responseText.substring(0, 200);
                }
                await uiAdapter.injectTextAndClickSend(responseDataText);
            },
            onerror: async function(response) {
                GM_log('AGA Controller: Error sending to Agent. Status: ' + response.status);
                const errorMsg = "AGA Error: Failed to send command to Local Agent. Status: " + response.status;
                await uiAdapter.injectTextAndClickSend(errorMsg);
            },
            ontimeout: async function() {
                GM_log('AGA Controller: Timeout sending command to Agent.');
                const errorMsg = "AGA Error: Timeout sending command to Local Agent.";
                await uiAdapter.injectTextAndClickSend(errorMsg);
            }
        });
    }

    async function sendCodeToAgentForInjection(codeToInject, uiAdapter) {
        const payload = { code_to_inject: codeToInject };
        GM_log('AGA Controller: Sending code to Agent for injection: ' + JSON.stringify(payload).substring(0, 100) + "...");
        GM_xmlhttpRequest({
            method: "POST",
            url: AGENT_INJECT_CODE_URL,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify(payload),
            timeout: 60000,
            onload: async function(response) {
                let responseMessage = "AGA Error: Code injection failed. Unknown server error.";
                if (response.status !== 200) {
                    GM_log('AGA Controller: Agent /inject_code endpoint returned non-200 status: ' + response.status + '. ResponseText: ' + response.responseText);
                    responseMessage = "AGA Error: Code injection failed. Server error status: " + response.status + ". Details: " + response.responseText.substring(0,100);
                } else {
                    try {
                        const responseData = JSON.parse(response.responseText);
                        GM_log("AGA Controller: Agent responded from /inject_code: " + JSON.stringify(responseData));
                        if (!responseData.success) {
                            responseMessage = "AGA Error: Code injection failed. Agent response: " + (responseData.detail || responseData.message || "Unknown error from agent");
                        } else {
                            responseMessage = "AGA: Code injection successful. Update initiated. Refreshing in 5s...";
                            // This part is generic
                            GM_log("AGA Controller: Triggering Tampermonkey update by opening: " + SCRIPT_URL_FOR_UPDATE);
                            const updateTab = window.open(SCRIPT_URL_FOR_UPDATE, '_blank');
                            GM_log("AGA Controller: Update tab opened.");
                            setTimeout(async () => {
                                GM_log("AGA Controller: Attempting to close update tab and reload current tab.");
                                if (updateTab) { try { updateTab.close(); } catch (e) { GM_log("AGA Controller: Error closing update tab: " + e); } }
                                window.location.reload();
                            }, 5000);
                        }
                    } catch (e) {
                        GM_log('AGA Controller: Error parsing Agent response from /inject_code: ' + e + '. Text: ' + response.responseText);
                        responseMessage = "AGA Error: Could not parse /inject_code response. Raw: " + response.responseText.substring(0, 200);
                    }
                }
                await uiAdapter.injectTextAndClickSend(responseMessage);
            },
            onerror: async function(response) {
                GM_log('AGA Controller: Error sending to Agent for code injection. Status: ' + response.status);
                const errorMsg = "AGA Error: Failed to send code to Local Agent for injection. Status: " + response.status;
                await uiAdapter.injectTextAndClickSend(errorMsg);
            },
            ontimeout: async function() {
                GM_log('AGA Controller: Timeout sending code to Agent for injection.');
                const errorMsg = "AGA Error: Timeout sending code to Local Agent for injection.";
                await uiAdapter.injectTextAndClickSend(errorMsg);
            }
        });
    }

    // --- DOM Scraping and Command Parsing Logic (Generic, uses adapter for feedback) ---
    async function checkForCommandsInTextAndSend(text, uiAdapter) {
        if (!text || typeof text !== 'string') { return; }
        if (!uiAdapter || !uiAdapter.injectTextAndClickSend) {
            GM_log("AGA Controller: checkForCommandsInTextAndSend called without a valid UI adapter for feedback.");
            // Proceeding without UI feedback capability for errors in this function
        }

        const trimmedText = text.trim();
        const COMMAND_PREFIX_LENGTH = COMMAND_PREFIX.length;
        let indices = [];
        let currentIndex = trimmedText.indexOf(COMMAND_PREFIX);
        while (currentIndex !== -1) {
            indices.push(currentIndex);
            currentIndex = trimmedText.indexOf(COMMAND_PREFIX, currentIndex + 1);
        }

        if (indices.length === 0) { return; }

        let firstHeuristicParseError = null;
        let firstHeuristicParseErrorJsonString = "";

        for (let i = indices.length - 1; i >= 0; i--) {
            const commandStartIndex = indices[i];
            const potentialJsonString = trimmedText.substring(commandStartIndex + COMMAND_PREFIX_LENGTH);
            const trimmedPotentialAttempt = potentialJsonString.trim();
            
            if (!trimmedPotentialAttempt) { continue; }

            let parsedPayload;
            try {
                parsedPayload = JSON.parse(trimmedPotentialAttempt);
            } catch (e) {
                const isLikelyJson = trimmedPotentialAttempt.startsWith('{') && trimmedPotentialAttempt.endsWith('}') && (trimmedPotentialAttempt.includes('command') || trimmedPotentialAttempt.includes('browser_code')) && trimmedPotentialAttempt.includes(':');
                if (isLikelyJson) {
                    GM_log('AGA Controller: Failed to parse LIKELY JSON: "', trimmedPotentialAttempt.substring(0, 200), '". Error: ', e);
                    if (!firstHeuristicParseError) {
                        firstHeuristicParseError = e;
                        firstHeuristicParseErrorJsonString = trimmedPotentialAttempt;
                    }
                } else {
                     GM_log('AGA Controller: Failed to parse (not likely JSON): ', trimmedPotentialAttempt.substring(0,200), '. Error: ', e);
                }
                continue;
            }

            if (!parsedPayload || typeof parsedPayload.command !== 'string') {
                GM_log('AGA Controller: Parsed JSON, but \'command\' field is missing/invalid. Payload: ', JSON.stringify(parsedPayload));
                continue;
            }

            if (parsedPayload.command === BROWSER_CODE_COMMAND) {
                if (typeof parsedPayload.stdin !== 'string' || !parsedPayload.stdin.trim()) {
                    GM_log('AGA Controller: ', BROWSER_CODE_COMMAND, ' error: stdin missing, not a string, or empty.');
                    await uiAdapter.injectTextAndClickSend("AGA Error: For " + BROWSER_CODE_COMMAND + ", 'stdin' must contain JavaScript code.");
                    return;
                }
                GM_log('AGA Controller: Valid ' + BROWSER_CODE_COMMAND + ' command. Sending code for injection.');
                await sendCodeToAgentForInjection(parsedPayload.stdin, uiAdapter);
                return;
            }

            // Default stdin to empty string if undefined for regular commands
            if (parsedPayload.stdin === undefined) {
                parsedPayload.stdin = "";
            }

            if (typeof parsedPayload.stdin !== 'string') {
                GM_log('AGA Controller: Parsed JSON, command valid, but stdin is present and not a string: ', trimmedPotentialAttempt);
                continue;
            }

            GM_log('AGA Controller: Valid command payload extracted: ', JSON.stringify(parsedPayload));
            await sendCommandToAgent(parsedPayload, uiAdapter);
            return;
        }

        if (firstHeuristicParseError) {
            const errorMessage = "AGA Error: Malformed JSON detected in your command.\nDetails: " + firstHeuristicParseError.message + 
                                 "\nProblematic JSON string: " + firstHeuristicParseErrorJsonString.substring(0, 100) + 
                                 (firstHeuristicParseErrorJsonString.length > 100 ? "..." : "");
            await uiAdapter.injectTextAndClickSend(errorMessage);
        }
    }

    // --- Event Listener for Potential Commands (Generic) ---
    async function handlePotentialCommandEvent(event) {
        if (!event || !event.detail || typeof event.detail.text !== 'string') {
            GM_log('AGA Controller: Invalid ' + AGA_POTENTIAL_COMMAND_EVENT + '.');
            return;
        }
        if (!UIManager.currentAdapter) {
            GM_log('AGA Controller: No current UI adapter to handle command event.');
            return;
        }
        GM_log('AGA Controller: Received ' + AGA_POTENTIAL_COMMAND_EVENT + ' with text: "' + event.detail.text.substring(0,100) + '..."');
        await checkForCommandsInTextAndSend(event.detail.text, UIManager.currentAdapter);
    }
    document.addEventListener(AGA_POTENTIAL_COMMAND_EVENT, handlePotentialCommandEvent);

    // --- INITIALIZATION & Network Interception (Generic Event Dispatch) ---
    UIManager.selectAdapter(); // Selects and initializes the adapter (which now sets up its own listener for AGA_NETWORK_RESPONSE_EVENT)

    if (!UIManager.currentAdapter) {
        GM_log("AGA Controller: No suitable UI adapter found. Cannot initialize network interceptors.");
        return; // Exit early if no adapter is selected
    }
    GM_log("AGA Controller: Adapter selected: " + UIManager.currentAdapter.name + ". Initializing generic network interceptors.");

    const originalXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        this._aga_method = method;
        this._aga_url = String(url); // Ensure URL is a string
        return originalXhrOpen.apply(this, arguments);
    };

    const originalXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
        const xhr = this;
        const method = xhr._aga_method;
        const url = xhr._aga_url;

        const dispatchNetworkEvent = (status, error = false, errorMessage = "") => {
            document.dispatchEvent(new CustomEvent(AGA_NETWORK_RESPONSE_EVENT, {
                detail: { method: method, url: url, status: status, error: error, errorMessage: errorMessage }
            }));
        };

        const originalOnLoad = xhr.onload;
        xhr.onload = function() {
            dispatchNetworkEvent(xhr.status);
            if (originalOnLoad) originalOnLoad.apply(this, arguments);
        };
        const originalOnError = xhr.onerror;
        xhr.onerror = function() { // Report XHR errors as status 0 or specific error code if available
            dispatchNetworkEvent(xhr.status || 0, true, "XHR Error");
            if (originalOnError) originalOnError.apply(this, arguments);
        };
        const originalOnTimeout = xhr.ontimeout;
        xhr.ontimeout = function() {
            dispatchNetworkEvent(xhr.status || 0, true, "XHR Timeout");
            if (originalOnTimeout) originalOnTimeout.apply(this, arguments);
        };

        return originalXhrSend.apply(this, arguments);
    };

    const originalFetch = window.fetch;
    window.fetch = async function(input, init) {
        const requestUrl = typeof input === 'string' ? input : (input instanceof URL ? input.href : (input && input.url ? input.url : String(input)));
        const requestMethod = init?.method?.toUpperCase() || (typeof input === 'object' && input.method?.toUpperCase()) || 'GET';
        
        try {
            const response = await originalFetch(input, init);
            document.dispatchEvent(new CustomEvent(AGA_NETWORK_RESPONSE_EVENT, {
                detail: { method: requestMethod, url: requestUrl, status: response.status }
            }));
            return response;
        } catch (error) {
            document.dispatchEvent(new CustomEvent(AGA_NETWORK_RESPONSE_EVENT, {
                detail: { method: requestMethod, url: requestUrl, status: 0, error: true, errorMessage: error.message }
            }));
            GM_log(`AGA Controller: Fetch error for ${requestUrl}: ${error}`);
            throw error;
        }
    };
    GM_log(`AGA Controller (Event-Driven Refactor): Initialized with ${UIManager.currentAdapter.name} adapter. Agent URL: ${AGENT_URL}, Inject URL: ${AGENT_INJECT_CODE_URL}`);
    
    // Execute dynamically injected code if any (this is generic)
    // This should run after adapter initialization in case injected code relies on adapter setup.
    if(!window.injectionExecuted) {
        executeDynamicallyInjectedBrowserCode();
        window.injectionExecuted = true;
    }
})();