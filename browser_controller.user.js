// ==UserScript==
// @name         AGA Browser-Side Controller
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Adds calm down period after RegenerateIcon to avoid immediate re-trigger by BatchExecute.
// @author       AGA Developer
// @match        https://gemini.google.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_log
// @connect      localhost
// ==/UserScript==

(function() {
    'use strict';

    const COMMAND_PREFIX = "AGA::";
    const AGENT_URL = "http://localhost:3000/command";

    // --- Network Interception URL Substrings (for infix matching) ---
    const STREAM_GENERATE_URL_SUBSTRING = "/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate"; // More specific substring
    const REGENERATE_ICON_URL_SUBSTRING = "/lamda/images/regenerate"; // More specific substring
    const BATCH_EXECUTE_URL_SUBSTRING = "/BardChatUi/data/batchexecute"; // More specific substring

    // --- Constants for DOM Scraping Logic ---
    const AGA_POTENTIAL_COMMAND_EVENT = "AgaPotentialCommandEvent"; // Custom event name
    const MESSAGE_CONTENT_SELECTOR = "message-content";

    // --- Selectors for Injecting Agent Response ---
    const GEMINI_RESPONSE_INPUT_EDITOR_SELECTOR = "div.ql-editor";
    const GEMINI_RESPONSE_SEND_BUTTON_SELECTOR = "button.send-button";

    // --- State variable for network flow ---
    let isWaitingForRegenerateIconResponse = false;
    let isCalmDownPeriodActive = false;
    const CALM_DOWN_DURATION_MS = 2000; // 2 seconds, adjust as needed

    // --- Spinner Elements and Functions ---
    const SPINNER_HTML = `
    <div id="aga-spinner" style="position: absolute; width: 24px; height: 24px; top: 10px; right: 10px; display: none;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2v4M12 18v4M4.22 4.22l2.83 2.83M16.97 16.97l2.83 2.83M2 12h4m14 0h4m-2.83-7.76l-2.83 2.83M4.22 16.97l2.83-2.83" />
        </svg>
    </div>
    `;

    function showSpinner() {
        const spinnerContainer = document.createElement('div');
        spinnerContainer.innerHTML = SPINNER_HTML;
        document.body.appendChild(spinnerContainer);
        const spinner = document.getElementById('aga-spinner');
        if (spinner) {
            spinner.style.display = 'block';
        }
    }

    function hideSpinner() {
        const spinner = document.getElementById('aga-spinner');
        if (spinner) {
            spinner.style.display = 'none';
        }
    }
    // --- End of Spinner Functions ---

    GM_log("AGA Controller: Script loaded (v2.3 - Calm Down Period. Agent URL: " + AGENT_URL + ").");

    // --- Unified Agent Communication Function ---
    function sendCommandToAgent(commandTextOrSystemSignal) {
        if (!commandTextOrSystemSignal || typeof commandTextOrSystemSignal !== 'string' || commandTextOrSystemSignal.trim() === '') {
            GM_log("AGA Controller: Invalid command/signal provided to sendCommandToAgent.");
            return;
        }
        GM_log(`AGA Controller: Sending to Agent (${AGENT_URL}): ${commandTextOrSystemSignal}`);
        GM_xmlhttpRequest({
            method: "POST",
            url: AGENT_URL,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({ command: commandTextOrSystemSignal }),
            timeout: 60000, 
            onload: async function(response) { 
                try {
                    const responseData = JSON.parse(response.responseText);
                    GM_log("AGA Controller: Agent responded: " + JSON.stringify(responseData));

                    // --- Inject responseData into Gemini's input and click send ---
                    const editorElement = document.querySelector(GEMINI_RESPONSE_INPUT_EDITOR_SELECTOR);
                    if (!editorElement) {
                        GM_log("AGA Controller: Editor element not found with selector: " + GEMINI_RESPONSE_INPUT_EDITOR_SELECTOR);
                        return;
                    }

                    const textToInject = JSON.stringify(responseData, null, 2);
                    
                    GM_log(`AGA Controller: Attempting to inject JSON into editor: "${textToInject.substring(0,100)}..."`);
                    editorElement.innerText = textToInject;
                    await new Promise(resolve => setTimeout(resolve, 200)); // Increased delay

                    // Dispatch input events to help frameworks recognize the change
                    editorElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    editorElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                    await new Promise(resolve => setTimeout(resolve, 100)); // Increased delay

                    const sendButtonElement = document.querySelector(GEMINI_RESPONSE_SEND_BUTTON_SELECTOR);
                    if (!sendButtonElement) {
                        GM_log("AGA Controller: Send button not found with selector: " + GEMINI_RESPONSE_SEND_BUTTON_SELECTOR + ". Cannot click send.");
                        return; 
                    }
                    
                    GM_log(`AGA Controller: Send button state before click: disabled=${sendButtonElement.disabled}, outerHTML=${sendButtonElement.outerHTML.substring(0,150)}`);
                    GM_log("AGA Controller: Attempting to simulate hover and click send button programmatically.");

                    // WAIT 1 SECOND BEFORE CLICKING
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    // Simulate hover
                    sendButtonElement.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
                    await new Promise(resolve => setTimeout(resolve, 100)); // Increased delay
                    sendButtonElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
                    await new Promise(resolve => setTimeout(resolve, 200)); // Increased delay

                    // Simulate click sequence
                    sendButtonElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                    await new Promise(resolve => setTimeout(resolve, 100)); // Increased delay
                    sendButtonElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                    await new Promise(resolve => setTimeout(resolve, 100)); // Increased delay
                    sendButtonElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    
                    GM_log("AGA Controller: Simulated click sequence complete.");
                    // --- End of injection logic ---

                } catch (e) {
                    GM_log(`AGA Controller: Error parsing Agent response or during injection: ${e}. Text: ${response.responseText}`);
                }
            },
            onerror: function(response) {
                GM_log(`AGA Controller: Error sending to Agent. Status: ${response.status}`);
            }
        });
    }

    // --- DOM Scraping Command Logic ---
    function checkForCommandsInTextAndSend(text) {
        if (!text || typeof text !== 'string' || !text.includes(COMMAND_PREFIX)) {
            return;
        }
        // Only respond to the latest (last) AGA:: instance
        const regex = new RegExp(COMMAND_PREFIX + "([^\n]+)", "g");
        let match;
        let lastCommand = null;
        while ((match = regex.exec(text)) !== null) {
            const command = match[1].trim();
            if (command) {
                lastCommand = command;
            }
        }
        if (lastCommand) {
            sendCommandToAgent(lastCommand);
        }
    }

    function handlePotentialCommandEvent(event) {
        if (!event || !event.detail || typeof event.detail.text !== 'string') {
            GM_log(`AGA Controller: Invalid ${AGA_POTENTIAL_COMMAND_EVENT}.`);
            return;
        }
        GM_log(`AGA Controller: Received ${AGA_POTENTIAL_COMMAND_EVENT} with text: "${event.detail.text.substring(0,100)}..."`);
        checkForCommandsInTextAndSend(event.detail.text);
    }

    document.addEventListener(AGA_POTENTIAL_COMMAND_EVENT, handlePotentialCommandEvent);

    // --- Network Interception Utility Functions ---
    const isTargetStreamGenerateUrl = (url) => {
        if (!url) return false;
        // For infix matching, we don't necessarily need to construct an absolute URL first,
        // unless the substring itself might be confused with path segments of the current page.
        // Assuming the substrings are specific enough.
        return url.includes(STREAM_GENERATE_URL_SUBSTRING);
    };

    const isTargetRegenerateIconUrl = (url) => {
        if (!url) return false;
        return url.includes(REGENERATE_ICON_URL_SUBSTRING);
    };

    const isTargetBatchExecuteUrl = (url) => {
        if (!url) return false;
        return url.includes(BATCH_EXECUTE_URL_SUBSTRING);
    };

    // --- Network Interception Handlers ---
    function handleStreamGeneratePostOutcome(isSuccess, status, interceptionType, url) {
        if (!isSuccess) {
            GM_log(`AGA Controller: ${interceptionType} POST not successful. Status: ${status}. URL: ${url}.`);
            return;
        }

        if (isCalmDownPeriodActive) {
            GM_log(`AGA Controller: ${interceptionType} POST occurred during calm down period. Ignoring. URL: ${url}`);
            return;
        }

        GM_log(`AGA Controller: ${interceptionType} POST successful. Waiting for RegenerateIcon. URL: ${url}`);
        isWaitingForRegenerateIconResponse = true;
    }

    function handleRegenerateIconGet(interceptedUrl, interceptionType) {
        GM_log(`AGA Controller: Intercepted ${interceptionType} GET to RegenerateIcon: ${interceptedUrl}. Waiting: ${isWaitingForRegenerateIconResponse}`);
        if (!isWaitingForRegenerateIconResponse) {
            GM_log(`AGA Controller: RegenerateIcon GET, but not waiting. Ignoring.`);
            return;
        }

        GM_log(`AGA Controller: RegenerateIcon GET while waiting. Processing for commands in DOM.`);

        // Perform DOM scraping and event dispatch
        const messageElements = document.querySelectorAll(MESSAGE_CONTENT_SELECTOR);
        if (messageElements.length === 0) {
            GM_log(`AGA Controller: RegenerateIcon trigger, but no <${MESSAGE_CONTENT_SELECTOR}> elements found.`);
        } else {
            const lastMessageElement = messageElements[messageElements.length - 1];
            const messageText = lastMessageElement.textContent || "";
            let logText = messageText;
            if (messageText.length > 100) {
                logText = messageText.substring(0, 100) + "...";
            }
            GM_log(`AGA Controller: Text from <${MESSAGE_CONTENT_SELECTOR}>: "${logText}"`);
            document.dispatchEvent(new CustomEvent(AGA_POTENTIAL_COMMAND_EVENT, { detail: { text: messageText } }));
        }

        isWaitingForRegenerateIconResponse = false; // Reset state
        GM_log(`AGA Controller: Reset isWaitingForRegenerateIconResponse.`);

        // Activate calm down period
        isCalmDownPeriodActive = true;
        GM_log(`AGA Controller: Calm down period activated for ${CALM_DOWN_DURATION_MS}ms.`);
        setTimeout(() => {
            isCalmDownPeriodActive = false;
            GM_log("AGA Controller: Calm down period ended.");
        }, CALM_DOWN_DURATION_MS);
    }

    // --- Network Interception Overrides ---
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        this._aga_method = method;
        this._aga_url = url;
        return originalXhrOpen.apply(this, arguments);
    };

    const originalXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
        const xhr = this;
        const method = xhr._aga_method;
        const url = xhr._aga_url;

        if (method === 'POST' && (isTargetStreamGenerateUrl(url) || isTargetBatchExecuteUrl(url))) {
            let requestType = isTargetStreamGenerateUrl(url) ? "StreamGenerate" : "BatchExecute";
            GM_log(`AGA Controller: XHR ${requestType} POST: ${url}`);
            const originalOnLoad = xhr.onload;
            xhr.onload = function() {
                handleStreamGeneratePostOutcome(xhr.status === 200, xhr.status, `XHR ${requestType}`, url);
                if (originalOnLoad) originalOnLoad.apply(this, arguments);
            };
        } else if (method === 'GET' && isTargetRegenerateIconUrl(url)) {
             const originalOnLoad = xhr.onload;
             xhr.onload = function() {
                if (xhr.status === 200) {
                    handleRegenerateIconGet(url, "XHR");
                } else {
                    GM_log(`AGA Controller: XHR RegenerateIcon GET to ${url} not successful (Status: ${xhr.status}).`);
                    if(isWaitingForRegenerateIconResponse) isWaitingForRegenerateIconResponse = false;
                }
                if (originalOnLoad) originalOnLoad.apply(this, arguments);
            };
        }
        return originalXhrSend.apply(this, arguments);
    };

    const originalFetch = window.fetch;
    window.fetch = async function(input, init) {
        const requestUrl = typeof input === 'string' ? input : input.url;
        const requestMethod = init?.method?.toUpperCase() || (typeof input === 'object' && input.method?.toUpperCase()) || 'GET';

        if (requestMethod === 'POST' && (isTargetStreamGenerateUrl(requestUrl) || isTargetBatchExecuteUrl(requestUrl))) {
            let requestType = isTargetStreamGenerateUrl(requestUrl) ? "StreamGenerate" : "BatchExecute";
            GM_log(`AGA Controller: Fetch ${requestType} POST: ${requestUrl}`);
            try {
                const response = await originalFetch(input, init);
                handleStreamGeneratePostOutcome(response.ok, response.status, `Fetch ${requestType}`, requestUrl);
                return response;
            } catch (error) {
                GM_log(`AGA Controller: Fetch ${requestType} POST error: ${error}. URL: ${requestUrl}`);
                throw error;
            }
        } else if (requestMethod === 'GET' && isTargetRegenerateIconUrl(requestUrl)) {
            GM_log(`AGA Controller: Fetch RegenerateIcon GET: ${requestUrl}`);
            try {
                const response = await originalFetch(input, init);
                if (response.ok) {
                    handleRegenerateIconGet(requestUrl, "Fetch");
                } else {
                     GM_log(`AGA Controller: Fetch RegenerateIcon GET to ${requestUrl} not successful (Status: ${response.status}).`);
                     if(isWaitingForRegenerateIconResponse) isWaitingForRegenerateIconResponse = false;
                }
                return response;
            } catch (error) {
                GM_log(`AGA Controller: Fetch RegenerateIcon GET error: ${error}. URL: ${requestUrl}`);
                if(isWaitingForRegenerateIconResponse) isWaitingForRegenerateIconResponse = false;
                throw error;
            }
        }
        return originalFetch(input, init);
    };

    // --- Initialization ---
    GM_log("AGA Controller (v2.3): Network interceptors initialized. Agent URL: " + AGENT_URL);

})();