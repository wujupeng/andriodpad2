const VALID_FLAGS = new Set(['--help', '--dry-run', '--execute', '--verbose', '--drill']);

export function parseArgs(toolName, usage, argv) {
  const args = argv.slice(2);
  const result = {
    help: false,
    dryRun: false,
    execute: false,
    verbose: false,
    drill: false,
    extra: [],
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--execute') {
      result.execute = true;
    } else if (arg === '--verbose') {
      result.verbose = true;
    } else if (arg === '--drill') {
      result.drill = true;
    } else if (arg.startsWith('--')) {
      console.error(`Error: Unknown flag "${arg}"`);
      console.error(`Usage: ${toolName} ${usage}`);
      process.exit(1);
    } else {
      result.extra.push(arg);
    }
  }

  if (result.help) {
    console.log(`Usage: ${toolName} ${usage}`);
    console.log('');
    console.log('Flags:');
    console.log('  --help       Show this help message and exit');
    console.log('  --dry-run    Show what would be done without executing');
    console.log('  --execute    Execute the operation (requires operator confirmation)');
    console.log('  --verbose    Enable verbose output');
    console.log('  --drill      Run in drill mode (for rollback演练, requires --execute)');
    process.exit(0);
  }

  if (result.drill && !result.execute) {
    console.error('Error: --drill requires --execute');
    process.exit(1);
  }

  return result;
}