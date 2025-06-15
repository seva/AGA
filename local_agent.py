from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import subprocess
import shlex

app = FastAPI()

class CommandRequest(BaseModel):
    command: str

class CommandResponse(BaseModel):
    stdout: str
    stderr: str
    return_code: int
    command: str

@app.post("/command", response_model=CommandResponse)
async def execute_command(request: CommandRequest):
    """
    Executes a shell command and returns its output.
    """
    try:
        # Basic security: ensure the command is a string
        if not isinstance(request.command, str):
            raise HTTPException(status_code=400, detail="Command must be a string.")

        # For security and proper argument handling, especially on Windows,
        # it's often better to pass a list of arguments to subprocess.run.
        # However, the spec mentions "run the command string directly in the host's default shell".
        # Using shell=True can be a security risk if the command string comes from an untrusted source.
        # Since this is for local execution by a power user, we proceed with caution.
        # On Windows, `shlex.split` might not work as expected for some shell built-ins.
        # Consider platform-specific handling if issues arise.
        
        # Using shell=True as per "run the command string directly in the host's default shell"
        # This means the command is interpreted by the shell (e.g., cmd.exe on Windows, /bin/sh on Linux)
        process = subprocess.run(
            request.command,
            shell=True,
            capture_output=True,
            text=True,
            check=False # Don't raise an exception for non-zero exit codes
        )
        
        return CommandResponse(
            command=request.command,
            stdout=process.stdout,
            stderr=process.stderr,
            return_code=process.returncode
        )
    except Exception as e:
        # Log the exception server-side for debugging
        print(f"Error executing command: {request.command}, Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to execute command: {str(e)}")

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