from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import subprocess
import shlex
from fastapi.responses import FileResponse, JSONResponse 
import os
import re # Make sure re is imported
import base64
import tempfile
import codecs
from email import message_from_string
from email.policy import default as email_default_policy
from email.message import EmailMessage
from email.header import decode_header
from email import message_from_bytes
from email.mime.text import MIMEText

app = FastAPI()

class CommandRequest(BaseModel):
    command: str
    stdin: str | None = ""
    # script_content and encoded_type removed; use stdin and encoding prefix

class CommandResponse(BaseModel):
    stdout: str
    stderr: str
    return_code: int
    command: str # Include the original command
    stdin: str | None = "" # Include the original stdin

class InjectCodeRequest(BaseModel): # New model for the inject_code endpoint
    code_to_inject: str

@app.post("/command", response_model=CommandResponse)
async def execute_command(request: CommandRequest):
    """
    Executes a shell command and returns its output.
    Accepts a command and an optional stdin string.
    Refactored with Guard Clauses.
    """
    try:
        # Guard Clause: Ensure the command is a string
        if not isinstance(request.command, str):
            raise HTTPException(status_code=400, detail="Command must be a string.")
        
        # Guard Clause: Ensure stdin is a string if provided
        if request.stdin is not None and not isinstance(request.stdin, str):
            raise HTTPException(status_code=400, detail="stdin must be a string if provided.")

        # --- New: run_python command ---
        if request.command == "run_python_mime":
            # Guard Clause: Check for stdin
            if not request.stdin or not isinstance(request.stdin, str):
                raise HTTPException(status_code=400, detail="Missing or invalid stdin for run_python_mime.")
            try:
                # If the input does not contain Content-Type, add a default Content-Type and Content-Transfer-Encoding
                if not re.search(r'^content-type:', request.stdin, re.IGNORECASE):
                    # Default to text/plain and 7bit encoding
                    mime_string = f"Content-Type: text/plain; charset=utf-8\nContent-Transfer-Encoding: 7bit\n\n{request.stdin}"
                else:
                    mime_string = request.stdin
                # Parse the MIME message
                msg = message_from_string(mime_string, policy=email_default_policy)
                # Use the email library to decode the payload according to Content-Transfer-Encoding
                if msg.is_multipart():
                    decoded_script = "".join(part.get_content() for part in msg.iter_parts())
                else:
                    decoded_script = msg.get_content()
                # Sanitize: replace all non-breaking spaces with standard spaces
                decoded_script = decoded_script.replace('\xa0', ' ')
            except Exception as e:
                return CommandResponse(
                    command=request.command,
                    stdin=request.stdin,
                    stdout="",
                    stderr=f"Failed to parse/decode MIME script: {e}",
                    return_code=1
                )
            # Force: Always use the temporary file fallback method
            try:
                with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as tmpf:
                    tmpf.write(decoded_script)
                    tmpf_path = tmpf.name
                process = subprocess.run(
                    ["python", tmpf_path],
                    capture_output=True,
                    text=True,
                    shell=False
                )
                os.unlink(tmpf_path)
                return CommandResponse(
                    command=request.command,
                    stdin=decoded_script,
                    stdout=process.stdout,
                    stderr=process.stderr,
                    return_code=process.returncode
                )
            except Exception as e2:
                # Always use process.stdout if process exists, else empty string
                stdout = process.stdout if 'process' in locals() and hasattr(process, 'stdout') else ""
                stderr = process.stderr if 'process' in locals() and hasattr(process, 'stderr') else f"Failed to execute Python script via temp file: {e2}"
                return_code = process.returncode if 'process' in locals() and hasattr(process, 'returncode') else 1
                return CommandResponse(
                    command=request.command,
                    stdin=decoded_script,
                    stdout=stdout,
                    stderr=stderr,
                    return_code=return_code
                )
        
        # Main logic proceeds if guard clauses are passed
        process_input = request.stdin # Will be None if request.stdin was None, or the string value

        process = subprocess.run(
            request.command,
            shell=True,
            capture_output=True,
            text=True,
            input=process_input, # Pass stdin to the subprocess
            check=False # Don't raise an exception for non-zero exit codes
        )
        
        return CommandResponse(
            command=request.command,
            stdin=request.stdin,
            stdout=process.stdout,
            stderr=process.stderr,
            return_code=process.returncode
        )
    except HTTPException: # Re-raise HTTPException to let FastAPI handle it
        raise
    except Exception as e:
        # Log the exception server-side for debugging
        print(f"Error executing command: {request.command} with stdin: {request.stdin}, Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to execute command: {str(e)}")

# New endpoint to serve the browser controller script
BROWSER_CONTROLLER_SCRIPT_PATH = os.path.join(os.path.dirname(__file__), "browser_controller.user.js")

# CHANGE THE PATH HERE
@app.get("/browser_controller.user.js")
async def serve_script():
    if not os.path.exists(BROWSER_CONTROLLER_SCRIPT_PATH):
        raise HTTPException(status_code=404, detail="Browser controller script not found.")
    
    headers = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "Content-Disposition": "inline; filename=\"browser_controller.user.js\""
    }
    return FileResponse(
        BROWSER_CONTROLLER_SCRIPT_PATH,
        media_type='application/javascript;charset=UTF-8',
        headers=headers
    )

# New endpoint to inject code into the browser controller script
@app.post("/inject_code")
async def inject_code_into_script(request: InjectCodeRequest):
    """
    Injects the provided JavaScript code into a placeholder
    in the browser_controller.user.js file using Guard Clauses.
    """
    start_marker = "// --- INJECTED_BROWSER_CODE_START ---"
    end_marker = "// --- INJECTED_BROWSER_CODE_END ---"

    # Guard Clause: Check if the script file exists
    if not os.path.exists(BROWSER_CONTROLLER_SCRIPT_PATH):
        # Log server-side for easier debugging if needed
        print(f"Critical Error: AGA browser_controller.user.js not found at configured path: {BROWSER_CONTROLLER_SCRIPT_PATH}")
        raise HTTPException(status_code=404, detail=f"Browser controller script file not found on server.")

    try:
        with open(BROWSER_CONTROLLER_SCRIPT_PATH, "r+", encoding="utf-8") as f:
            content = f.read()

            # Guard Clause: Check for start marker
            start_index = content.find(start_marker)
            if start_index == -1:
                print(f"Critical Error: Start marker '{start_marker}' not found in {BROWSER_CONTROLLER_SCRIPT_PATH}.")
                raise HTTPException(status_code=500, detail=f"Start marker '{start_marker}' not found in browser_controller.user.js. Injection aborted.")

            # Guard Clause: Check for end marker after start marker
            end_index = content.find(end_marker, start_index + len(start_marker))
            if end_index == -1:
                print(f"Critical Error: End marker '{end_marker}' not found after start marker in {BROWSER_CONTROLLER_SCRIPT_PATH}.")
                raise HTTPException(status_code=500, detail=f"End marker '{end_marker}' not found after start marker in browser_controller.user.js. Injection aborted.")

            # Proceed with injection logic if all guards are passed
            # Find the end of the start_marker line to insert after it
            start_marker_line_end = content.find("\n", start_index)
            if start_marker_line_end == -1: # Should not happen if markers are on their own lines and not at EOF
                # This case implies start_marker is the last line or file is malformed.
                # For robustness, treat as inserting immediately after the marker text itself.
                start_marker_line_end = start_index + len(start_marker)
            else:
                start_marker_line_end += 1 # Move to the beginning of the next line for insertion
            
            injected_code = request.code_to_inject.strip()
            # Ensure the injected code ends with a newline if it doesn't already, for clean separation
            if not injected_code.endswith('\n'):
                injected_code += '\n'

            # The content between start_marker_line_end and end_index is replaced.
            # The end_marker itself is preserved, and we add 4 spaces for its typical indentation.
            new_content_after_injection = content[:start_marker_line_end] + injected_code + "    " + content[end_index:]

            # --- Increment @version --- 
            # Regex to find the @version line, capturing prefix, version, and suffix
            # It handles versions like X.Y or X.Y.Z and potential extra spaces
            version_pattern = r"^(// @version\s+)([\d\.]+)(.*)$"
            match = re.search(version_pattern, new_content_after_injection, re.MULTILINE)
            final_content_with_new_version = new_content_after_injection # Default to original if no version found

            if match:
                prefix = match.group(1)  # e.g., "// @version      "
                current_version_str = match.group(2)  # e.g., "3.1" or "3.1.0"
                suffix = match.group(3)  # any trailing characters on that line (e.g., comments)

                version_parts = current_version_str.split('.')
                
                # Ensure at least three parts (Major.Minor.Patch) for consistent incrementing
                while len(version_parts) < 3:
                    version_parts.append('0')
                
                try:
                    # Increment the patch version (the third part)
                    version_parts[2] = str(int(version_parts[2]) + 1)
                    new_version_str = ".".join(version_parts)
                    
                    old_version_line = match.group(0) # The entire matched line
                    new_version_line = f"{prefix}{new_version_str}{suffix}"
                    
                    # Replace only the first occurrence of the version line
                    final_content_with_new_version = new_content_after_injection.replace(old_version_line, new_version_line, 1)
                    print(f"AGA Agent: Incremented script version from '{current_version_str}' to '{new_version_str}'")
                except ValueError:
                    print(f"Warning: Could not increment patch version for '{current_version_str}'. Patch part '{version_parts[2]}' is not a number.")
                except IndexError:
                     # This case should ideally be prevented by the padding loop above
                     print(f"Warning: Version string '{current_version_str}' is too short to increment patch version after padding.")
            else:
                print("Warning: @version line not found in script. Cannot increment version. Tampermonkey may not detect update.")
            # --- End of Increment @version ---

            f.seek(0)
            f.write(final_content_with_new_version) # Write the content with potentially updated version
            f.truncate()

        return JSONResponse(content={"success": True, "message": "Code injected and version incremented successfully."}, status_code=200)
    
    except HTTPException: # Re-raise HTTPException if it was raised by a guard or other logic
        raise
    except Exception as e:
        # Log the exception server-side for debugging
        print(f"Error during file operation or unexpected issue in /inject_code: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred on the server during code injection: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    # It's good practice to make host and port configurable,
    # but for simplicity, we'll hardcode them here.
    # The Local Agent listens on localhost only.
    uvicorn.run(app, host="127.0.0.1", port=3000)

# To run this:
# 1. Make sure you have fastapi and uvicorn installed:
#    pip install fastapi "uvicorn[standard]"
# 2. Run the script:
#    python main.py
# The server will be available at http://127.0.0.1:3000