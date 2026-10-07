"""Invoke the installed Blender MCP through the actual MCP stdio protocol.

Image responses are saved alongside a small receipt so visual inspections can
be reviewed without copying base64 images into terminal output.
"""
import argparse
import asyncio
import base64
import json
import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("tool")
    parser.add_argument("--code", type=Path)
    parser.add_argument("--args", default="{}")
    parser.add_argument("--vars", default="{}")
    parser.add_argument("--output", type=Path, required=True)
    options = parser.parse_args()
    runtime = Path(os.environ.get("BREAK_BUILDER_TOOLS", "D:/DevTools/BreakBuilderNative"))
    env = dict(os.environ, DISABLE_TELEMETRY="true", BLENDER_HOST="127.0.0.1",
               BLENDER_PORT="9876", BLENDER_MCP_SAFE_MODE="1", PYTHONUTF8="1",
               TEMP=str(runtime / "tmp"), TMP=str(runtime / "tmp"),
               BLENDERMCP_ADDONS_DIR=str(runtime / "blender-user/scripts/addons"))
    params = StdioServerParameters(
        command=str(runtime / "mcp-runtime/Scripts/python.exe"),
        args=["-m", "blender_mcp.server"], env=env,
    )
    options.output.parent.mkdir(parents=True, exist_ok=True)
    log = (runtime / "mcp-client.log").open("a", encoding="utf-8")
    async with stdio_client(params, errlog=log) as (read, write):
        async with ClientSession(read, write) as session:
            server = await session.initialize()
            if options.tool == "list":
                result = await session.list_tools()
                data = result.model_dump(mode="json")
            else:
                args = json.loads(options.args)
                inputs = {}
                if options.code:
                    variables = json.loads(options.vars)
                    if variables.get('INPUT_FILE'):
                        source = Path(variables['INPUT_FILE'])
                        inputs = {'file': str(source), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
                    if not all(key.isidentifier() for key in variables):
                        raise ValueError("Invalid Blender script variable name")
                    prefix = "".join(f"{key} = {value!r}\n" for key, value in variables.items())
                    args["code"] = prefix + options.code.read_text(encoding="utf-8")
                result = await session.call_tool(options.tool, args)
                data = result.model_dump(mode="json")
                for index, block in enumerate(data.get("content", [])):
                    if block.get("type") == "image":
                        target = options.output.with_name(options.output.stem + f"-{index}.png")
                        target.write_bytes(base64.b64decode(block.pop("data")))
                        block["savedImage"] = str(target.resolve())
            receipt = {"time": datetime.now(timezone.utc).isoformat(), "tool": options.tool,
                       "server": server.serverInfo.model_dump(), "result": data}
            if options.tool != 'list' and inputs:
                receipt['inputs'] = inputs
            options.output.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
            summary = json.loads(json.dumps(data))
            for block in summary.get("content", []):
                if block.get("type") == "text" and len(block.get("text", "")) > 2000:
                    block["text"] = block["text"][:600] + "\n...full output in receipt...\n" + block["text"][-1000:]
            summary.pop("structuredContent", None)
            print(json.dumps(summary, ensure_ascii=False))
            if data.get("isError") or any(block.get("text", "").startswith(("Error", "Rejected")) for block in data.get("content", [])):
                raise RuntimeError("Blender MCP tool failed; see saved receipt")


if __name__ == "__main__":
    asyncio.run(main())
