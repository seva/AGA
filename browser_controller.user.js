// ==UserScript==
// @name         AGA Browser-Side Controller
// @namespace    http://tampermonkey.net/
// @version      2.8
// @description  Smarter JSON parsing error feedback; silent UI for missing/invalid command field.
// @author       AGA Developer
// @match        https://gemini.google.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_log
// @connect      localhost
// ==/UserScript==

(function() {
    'use strict';

    // --- Constants and Selectors ---
    const COMMAND_PREFIX = "AGA::";
    const AGENT_URL = "http://localhost:3000/command";

    // --- Network Interception URL Substrings (for infix matching) ---
    const STREAM_GENERATE_URL_SUBSTRING = "/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate";
    const REGENERATE_ICON_URL_SUBSTRING = "/lamda/images/regenerate";
    const BATCH_EXECUTE_URL_SUBSTRING = "/BardChatUi/data/batchexecute";

    // --- Constants for DOM Scraping Logic ---
    const AGA_POTENTIAL_COMMAND_EVENT = "AgaPotentialCommandEvent";
    const MESSAGE_CONTENT_SELECTOR = "message-content";

    // --- Selectors for Injecting Agent Response ---
    const GEMINI_RESPONSE_INPUT_EDITOR_SELECTOR = "div.ql-editor";
    const GEMINI_RESPONSE_SEND_BUTTON_SELECTOR = "button.send-button";

    // --- State variable for network flow ---
    let isWaitingForRegenerateIconResponse = false;
    let isCalmDownPeriodActive = false;
    const CALM_DOWN_DURATION_MS = 2000;

    // --- Spinner Elements and Functions ---
    let spinnerElement = null; // Keep a reference to the spinner element

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
        return spinnerDiv;
    }

    function showSpinner() {
        if (!spinnerElement) {
            spinnerElement = createSpinnerElement();
            document.body.appendChild(spinnerElement);
        }
        if (spinnerElement) {
            GM_log("AGA Controller: Showing spinner.");
            spinnerElement.style.display = 'block';
        }
    }

    function hideSpinner() {
        if (spinnerElement) {
            GM_log("AGA Controller: Hiding spinner.");
            spinnerElement.style.display = 'none';
        }
    }
    // --- End of Spinner Functions ---

    GM_log("AGA Controller: Script loaded (v2.8 - Heuristic JSON error UI. Agent URL: " + AGENT_URL + ").");

    // --- Reusable UI Injection Function ---
    async function injectTextAndClickSend(textToInject) {
        const editorElement = document.querySelector(GEMINI_RESPONSE_INPUT_EDITOR_SELECTOR);
        if (!editorElement) {
            GM_log("AGA Controller: Editor element not found with selector: " + GEMINI_RESPONSE_INPUT_EDITOR_SELECTOR);
            return;
        }

        GM_log('AGA Controller: Attempting to inject text into editor: "' + String(textToInject).substring(0,100) + '..."');
        // Ensure textToInject is a string, especially if it's an error object.
        editorElement.innerText = String(textToInject);
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
        
        GM_log('AGA Controller: Send button state before click: disabled=' + sendButtonElement.disabled + ', outerHTML=' + sendButtonElement.outerHTML.substring(0,150));
        GM_log("AGA Controller: Attempting to simulate hover and click send button programmatically.");

        // WAIT before CLICKING
        await new Promise(resolve => setTimeout(resolve, 1000)); // Adjusted wait time

        // Simulate hover
        sendButtonElement.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
        await new Promise(resolve => setTimeout(resolve, 100)); 
        sendButtonElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
        await new Promise(resolve => setTimeout(resolve, 200)); 

        // Simulate click sequence
        sendButtonElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        await new Promise(resolve => setTimeout(resolve, 100)); 
        sendButtonElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        await new Promise(resolve => setTimeout(resolve, 100)); 
        sendButtonElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        
        GM_log("AGA Controller: Simulated click sequence complete for injected text.");
    }

    // --- Unified Agent Communication Function ---
    function sendCommandToAgent(commandPayload) {
        // Guard Clause: Validate commandPayload structure
        if (!commandPayload || typeof commandPayload !== 'object' ||
            typeof commandPayload.command !== 'string' || typeof commandPayload.stdin !== 'string') {
            GM_log("AGA Controller: Invalid command payload provided to sendCommandToAgent. Expected {command: string, stdin: string}. Payload: " + JSON.stringify(commandPayload));
            // provide feedback to UI about this internal error too
            injectTextAndClickSend("AGA Internal Error: Invalid payload structure before sending to agent."); 
            return;
        }

        showSpinner(); // Show spinner before sending command
        const dataToSend = JSON.stringify(commandPayload);
        GM_log('AGA Controller: Preparing to send command object to Agent: ' + dataToSend);
        GM_log('AGA Controller: Sending to Agent (' + AGENT_URL + '): ' + dataToSend);

        GM_xmlhttpRequest({
            method: "POST",
            url: AGENT_URL,
            headers: { "Content-Type": "application/json" },
            data: dataToSend,
            timeout: 60000,
            onload: async function(response) {
                try {
                    const responseData = JSON.parse(response.responseText);
                    GM_log("AGA Controller: Agent responded: " + JSON.stringify(responseData));
                    const formattedResponse = JSON.stringify(responseData, null, 2);
                    await injectTextAndClickSend(formattedResponse);
                } catch (e) {
                    GM_log('AGA Controller: Error parsing Agent response: ' + e + '. Text: ' + response.responseText);
                    await injectTextAndClickSend("AGA Error: Could not parse response from Local Agent. Raw response: " + response.responseText.substring(0, 200));
                } finally {
                    hideSpinner(); // Hide spinner after operation completes or fails
                }
            },
            onerror: async function(response) { // Make onerror async
                GM_log('AGA Controller: Error sending to Agent. Status: ' + response.status);
                await injectTextAndClickSend("AGA Error: Failed to send command to Local Agent. Status: " + response.status);
                hideSpinner(); // Hide spinner after error handling
            }
        });
    }

    // --- DOM Scraping Command Logic ---
    async function checkForCommandsInTextAndSend(text) { // Made async
        // Guard Clause: Ensure text is a non-empty string
        if (!text || typeof text !== 'string') {
            return;
        }

        const trimmedText = text.trim();
        const commandPrefixIndex = trimmedText.lastIndexOf(COMMAND_PREFIX);

        // Guard Clause: Check if COMMAND_PREFIX exists and has content after it
        if (commandPrefixIndex === -1 || commandPrefixIndex + COMMAND_PREFIX.length >= trimmedText.length) {
            return;
        }

        const potentialJsonString = trimmedText.substring(commandPrefixIndex + COMMAND_PREFIX.length);
        if (!potentialJsonString) {
            return;
        }

        let parsedPayload;
        try {
            parsedPayload = JSON.parse(potentialJsonString);
        } catch (e) {
            const trimmedPotential = potentialJsonString.trim();
            // Heuristic: Only show JSON.parse error in UI if it looks like an attempt at a JSON object.
            if (trimmedPotential.startsWith('{') && trimmedPotential.endsWith('}') && trimmedPotential.includes(':') && trimmedPotential.includes('command')) {
                GM_log('AGA Controller: Failed to parse likely JSON object: "' + potentialJsonString + '". Error: ' + e);
                const errorMessage = "AGA Error: Malformed JSON detected in your command.\nDetails: " + e.message + "\nProblematic JSON string: " + potentialJsonString.substring(0, 100) + (potentialJsonString.length > 100 ? "..." : "");
                showSpinner();
                await injectTextAndClickSend(errorMessage);
                hideSpinner();
            } else {
                // Not a clear attempt at JSON object, fail silently in UI, but log for debugging.
                GM_log('AGA Controller: Failed to parse text after AGA:: as JSON (not an obvious JSON object attempt): "' + potentialJsonString + '". Error: ' + e);
            }
            return; 
        }

        // Successfully parsed JSON, now validate structure
        // Silently ignore (in UI) if command field is missing or not a string.
        if (!parsedPayload || typeof parsedPayload.command !== 'string') {
            GM_log('AGA Controller: Parsed JSON, but \'command\' field is missing or not a string. Payload: ' + JSON.stringify(parsedPayload) + '. Original: ' + potentialJsonString);
            // No UI error for this specific case as per request.
            return;
        }

        // Handle optional stdin: if present, must be a string; if absent, defaults to ""
        if (parsedPayload.stdin === undefined) {
            parsedPayload.stdin = "";
        } else if (typeof parsedPayload.stdin !== 'string') {
            GM_log('AGA Controller: Parsed JSON, command is valid, but stdin is present and not a string: ' + potentialJsonString);
            const errorMsg = "AGA Error: Parsed JSON is invalid. \'stdin\' field, if present, must be a string. Received: " + potentialJsonString.substring(0,150);
            showSpinner();
            await injectTextAndClickSend(errorMsg);
            hideSpinner();
            return;
        }

        GM_log('AGA Controller: Valid command payload extracted: ' + JSON.stringify(parsedPayload));
        sendCommandToAgent(parsedPayload); // This function handles its own spinner for agent communication
    }

    async function handlePotentialCommandEvent(event) { // Made async
        // Guard Clause: Validate event and event.detail.text
        if (!event || !event.detail || typeof event.detail.text !== 'string') {
            GM_log('AGA Controller: Invalid ' + AGA_POTENTIAL_COMMAND_EVENT + '.');
            return;
        }
        GM_log('AGA Controller: Received ' + AGA_POTENTIAL_COMMAND_EVENT + ' with text: "' + event.detail.text.substring(0,100) + '..."');
        await checkForCommandsInTextAndSend(event.detail.text); // Await if it involves UI feedback for errors
    }

    document.addEventListener(AGA_POTENTIAL_COMMAND_EVENT, handlePotentialCommandEvent);

    // --- Network Interception Utility Functions ---
    const isTargetStreamGenerateUrl = (url) => {
        if (!url) return false;
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
            GM_log('AGA Controller: ' + interceptionType + ' POST not successful. Status: ' + status + '. URL: ' + url + '.');
            return;
        }
        if (isCalmDownPeriodActive) {
            GM_log('AGA Controller: ' + interceptionType + ' POST occurred during calm down period. Ignoring. URL: ' + url);
            return;
        }
        GM_log('AGA Controller: ' + interceptionType + ' POST successful. Waiting for RegenerateIcon. URL: ' + url);
        isWaitingForRegenerateIconResponse = true;
    }

    function handleRegenerateIconGet(interceptedUrl, interceptionType) {
        GM_log('AGA Controller: Intercepted ' + interceptionType + ' GET to RegenerateIcon: ' + interceptedUrl + '. Waiting: ' + isWaitingForRegenerateIconResponse);
        
        if (!isWaitingForRegenerateIconResponse) {
            GM_log('AGA Controller: RegenerateIcon GET, but not waiting. Ignoring.');
            return;
        }

        GM_log('AGA Controller: RegenerateIcon GET while waiting. Processing for commands in DOM.');
        isWaitingForRegenerateIconResponse = false; // Reset state immediately

        const messageElements = document.querySelectorAll(MESSAGE_CONTENT_SELECTOR);
        if (messageElements.length === 0) {
            GM_log('AGA Controller: RegenerateIcon trigger, but no <' + MESSAGE_CONTENT_SELECTOR + '> elements found.');
        } else {
            const lastMessageElement = messageElements[messageElements.length - 1];
            const messageText = lastMessageElement.textContent || "";
            let logText = messageText.substring(0, 100) + (messageText.length > 100 ? "..." : "");
            GM_log('AGA Controller: Text from <' + MESSAGE_CONTENT_SELECTOR + '>: "' + logText + '"');
            document.dispatchEvent(new CustomEvent(AGA_POTENTIAL_COMMAND_EVENT, { detail: { text: messageText } }));
        }

        isCalmDownPeriodActive = true;
        GM_log('AGA Controller: Calm down period activated for ' + CALM_DOWN_DURATION_MS + 'ms.');
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
            GM_log('AGA Controller: XHR ' + requestType + ' POST: ' + url);
            const originalOnLoad = xhr.onload;
            xhr.onload = function() {
                handleStreamGeneratePostOutcome(xhr.status === 200, xhr.status, 'XHR ' + requestType, url);
                if (originalOnLoad) originalOnLoad.apply(this, arguments);
            };
        } else if (method === 'GET' && isTargetRegenerateIconUrl(url)) {
             const originalOnLoad = xhr.onload;
             xhr.onload = function() {
                if (xhr.status === 200) {
                    handleRegenerateIconGet(url, "XHR");
                } else {
                    GM_log('AGA Controller: XHR RegenerateIcon GET to ' + url + ' not successful (Status: ' + xhr.status + ').');
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
            GM_log('AGA Controller: Fetch ' + requestType + ' POST: ' + requestUrl);
            try {
                const response = await originalFetch(input, init);
                handleStreamGeneratePostOutcome(response.ok, response.status, 'Fetch ' + requestType, requestUrl);
                return response;
            } catch (error) {
                GM_log('AGA Controller: Fetch ' + requestType + ' POST error: ' + error + '. URL: ' + requestUrl);
                if(isWaitingForRegenerateIconResponse) isWaitingForRegenerateIconResponse = false;
                throw error;
            }
        } else if (requestMethod === 'GET' && isTargetRegenerateIconUrl(requestUrl)) {
            GM_log('AGA Controller: Fetch RegenerateIcon GET: ' + requestUrl);
            try {
                const response = await originalFetch(input, init);
                if (response.ok) {
                    handleRegenerateIconGet(requestUrl, "Fetch");
                } else {
                     GM_log('AGA Controller: Fetch RegenerateIcon GET to ' + requestUrl + ' not successful (Status: ' + response.status + ').');
                     if(isWaitingForRegenerateIconResponse) isWaitingForRegenerateIconResponse = false;
                }
                return response;
            } catch (error) {
                GM_log('AGA Controller: Fetch RegenerateIcon GET error: ' + error + '. URL: ' + requestUrl);
                if(isWaitingForRegenerateIconResponse) isWaitingForRegenerateIconResponse = false;
                throw error;
            }
        }
        return originalFetch(input, init);
    };

    // --- Initialization ---
    GM_log("AGA Controller (v2.8): Network interceptors initialized. Agent URL: " + AGENT_URL);

})();