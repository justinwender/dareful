/**
 * The explorer's page for an address on the chain the app is on (the field round, 3.1): Monad testnet through
 * submission (chain 10143), mainnet after (143). Pure; the addresses themselves come from the environment.
 */
export function explorerAddressUrl(chainId: number, address: string): string {
  const host = chainId === 143 ? "https://monadexplorer.com" : "https://testnet.monadexplorer.com";
  return `${host}/address/${address}`;
}
