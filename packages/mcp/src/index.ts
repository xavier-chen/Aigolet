import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { McpServer } from '@aigolet-next/protocol';
import type { ToolHandler, ToolRegistry } from '@aigolet-next/tools';

export interface McpDiscoveredTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  serverId: string;
  serverName: string;
}

export interface McpBridgeResult {
  tools: McpDiscoveredTool[];
  registeredToolIds: string[];
  cleanup: () => Promise<void>;
}

function mcpToolId(serverId: string, toolName: string): string {
  return `mcp_${serverId}_${toolName}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

export async function connectMcpServer(server: McpServer): Promise<{
  client: Client;
  transport: StdioClientTransport;
  tools: McpDiscoveredTool[];
}> {
  const transport = new StdioClientTransport({
    command: server.command,
    args: server.args,
    env: { ...process.env, ...server.env } as Record<string, string>,
  });

  const client = new Client({ name: 'aigolet-next', version: '0.1.0' });
  await client.connect(transport);

  const listed = await client.listTools();
  const tools: McpDiscoveredTool[] = (listed.tools ?? []).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
    serverId: server.id,
    serverName: server.name,
  }));

  return { client, transport, tools };
}

export async function registerMcpTools(
  registry: ToolRegistry,
  servers: McpServer[],
): Promise<McpBridgeResult> {
  const clients: Client[] = [];
  const transports: StdioClientTransport[] = [];
  const discovered: McpDiscoveredTool[] = [];
  const registeredToolIds: string[] = [];

  for (const server of servers.filter((s) => s.enabled)) {
    try {
      const { client, transport, tools } = await connectMcpServer(server);
      clients.push(client);
      transports.push(transport);
      discovered.push(...tools);

      for (const tool of tools) {
        const toolId = mcpToolId(server.id, tool.name);
        if (registry.get(toolId)) continue;

        const handler: ToolHandler = async (input) => {
          const result = await client.callTool({
            name: tool.name,
            arguments: (input as Record<string, unknown>) ?? {},
          });
          return result;
        };

        registry.register(
          {
            id: toolId,
            name: toolId,
            description: tool.description ?? `MCP tool ${tool.name} from ${server.name}`,
            inputSchema: tool.inputSchema,
          },
          handler,
        );
        registeredToolIds.push(toolId);
      }
    } catch (err) {
      console.error(`[mcp] Failed to connect server "${server.name}":`, err);
    }
  }

  return {
    tools: discovered,
    registeredToolIds,
    cleanup: async () => {
      for (const client of clients) {
        try {
          await client.close();
        } catch {
          // ignore close errors
        }
      }
    },
  };
}
