// Everything the web app says, in English: the source the Chinese dictionary follows key by key.
// Values are text, or functions of plain values (numbers, names) for text that holds them.
// Labels on the phone's own screens (Connect, Show code, Scan request, Accounts #0 to #99) are
// the phone's words.

/** "1 account", "2 accounts". */
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const en = {
	common: {
		home: 'Home',
		refresh: 'Refresh',
		mainnet: 'Mainnet',
		testnet: 'Testnet',
		/** Between the items of a list: chain names, symbols. */
		comma: ', ',
		/** Between longer items: what could not be read. */
		semicolon: '; ',
		/** Between two alternatives: "Bitcoin or EVM". */
		or: ' or ',
		noAnswer: 'no answer',
		/** An account none of whose chains could be asked. */
		noAnswerAtAll: 'No answer.'
	},
	app: {
		networksShown: 'Networks shown',
		settings: 'Settings',
		scanPhone: 'Scan phone',
		testnetBanner: 'Testnet: these coins have no value. Real balances are under Mainnet.',
		/** The switch shows the other language, in that language. */
		otherLang: '中文',
		switchLang: 'Switch to Chinese'
	},
	home: {
		total: 'Total',
		readingLeft: (n: number) => `Reading, ${n} to go…`,
		testCoins: 'Test coins',
		testUnpriced: 'Nothing on a test network is priced.',
		readingBalances: 'Reading balances',
		notCountedBefore: (names: string) => `Not counted: ${names} did not answer (`,
		endpoints: 'endpoints',
		notCountedAfter: ').',
		noPrice: (symbols: string) => `No price for ${symbols}: not in the total.`,
		andMore: (names: string, more: number) => `${names} and ${more} more`,
		couldNotRead: (what: string) => `Could not read ${what}.`,
		bunker: 'Bunker',
		exposed: 'Exposed',
		bunkerNote: (n: number) => `${plural(n, 'account')} holding, keys never revealed`,
		toMoveNote: (n: number) => `${n} to move, one signing each`,
		nothingExposed: 'Nothing behind a revealed key',
		receiveBitcoin: 'Receive Bitcoin',
		receiveEvm: 'Receive on EVM',
		noHiddenBefore: (networks: string, start: number, end: number) =>
			`No ${networks} account with a hidden key is connected here. On the phone, turn the wheel to #${start}, then Connect → Accounts #${start} to #${end}, and `,
		fewFreshBefore: (network: string, n: number, start: number, end: number) =>
			`Only ${n} unused ${network} ${n === 1 ? 'account is' : 'accounts are'} connected here for bunker mode to move funds to. Before they run out: on the phone, turn the wheel to #${start}, then Connect → Accounts #${start} to #${end}, and `,
		scanIt: 'scan it',
		noHiddenAfter: '.',
		toMove: 'To move',
		toMoveLead:
			'These accounts have sent before, so their public keys are on chain. Move what each holds to an account whose key is still hidden, one signing per chain.',
		move: 'Move',
		smallMoves: (n: number, under: string) =>
			`${n} more, each worth under ${under}: a move may cost more in fees`,
		assets: 'Assets',
		showAssetsOf: 'Show the assets of',
		all: 'All',
		readingBalancesDots: 'Reading balances…',
		nothingHeld: 'Nothing held yet. Receive at an account above; the assets show here.',
		accountsCount: (n: number) => plural(n, 'account'),
		accounts: 'Accounts'
	},
	wallet: {
		notChecked: 'Not checked',
		empty: 'Empty',
		moreChains: (n: number) => `and ${n} more ${n === 1 ? 'chain' : 'chains'}`,
		connectTitle: 'Connect your Airkeys phone',
		connectLead: 'The web app gets addresses only, never keys.',
		step1Before: 'On the phone, open your wallet: ',
		step1Connect: 'Connect',
		step1Middle: ' → choose networks → ',
		step1Show: 'Show code',
		step2Before: 'Here: ',
		step2Scan: 'Scan the phone',
		step2After: ', and hold the code up to this camera',
		scanThePhone: 'Scan the phone',
		counts: (accounts: number, addresses: number) =>
			`${plural(accounts, 'account')} · ${plural(addresses, 'address', 'addresses')}`,
		readingLeft: (n: number) => ` · reading balances, ${n} to go`,
		bitcoinMainnetOnly: 'Bitcoin accounts show under Mainnet: Airkeys has no Bitcoin test network.',
		account: (index: number) => `Account #${index}`,
		emptyFolded: (n: number, list: string) => `${plural(n, 'empty account')}: ${list} — show`,
		hideEmpty: 'Hide the empty accounts',
		skipped: (first: number, last: number, gap: number) =>
			first === last
				? `Bitcoin account #${first} was not checked: Airkeys stops after ${gap} unused accounts in a row (each address is one request).`
				: `Bitcoin accounts #${first} to #${last} were not checked: Airkeys stops after ${gap} unused accounts in a row (each address is one request).`,
		checkThem: (n: number): string => (n === 1 ? 'Check it' : 'Check them')
	},
	account: {
		copied: 'Copied',
		notCopied: 'Not copied: select the address',
		refreshing: 'Refreshing…',
		title: (network: string, index: number) => `${network} · account #${index}`,
		receiveAt: 'Receive at',
		copyAddress: 'Copy address',
		explorer: 'Explorer ↗',
		sameOnEvm: 'The same address on every EVM chain.',
		exposedBefore: 'This address has sent before, so its public key is on chain. Use ',
		moveAll: 'Move all',
		exposedAfter:
			' below to move what it holds to an account whose key is still hidden, one signing per chain.',
		hidden:
			"This address's public key has never been revealed. Receiving keeps it hidden; the first send reveals it.",
		send: 'Send',
		nothingToSend: 'Nothing to send yet',
		holdsNothingBefore: (chains: string) =>
			`This account holds nothing on ${chains}. Receive at the address above; each coin or token then appears here with a `,
		holdsNothingAfter: ' button.',
		nothingOn: (chains: string) => `Nothing on ${chains}.`,
		coin: 'The chain’s own coin',
		unreachable: (what: string) => `Not reachable: ${what}. Change the endpoint in Settings.`,
		remove: 'Remove this account from this browser'
	},
	exposure: {
		hiddenTitle: 'The public key behind this address has never been revealed',
		hidden: 'Key hidden',
		exposedTitle: 'This address has sent before: its public key is on chain',
		exposed: 'Key exposed',
		checking: 'Checking…',
		unknownTitle: 'An endpoint did not answer, so it is not known whether this key was revealed',
		unknown: 'Unknown'
	},
	connect: {
		notAccounts: 'This is a signed reply, not accounts. On the phone, tap Connect.',
		otherWallet: 'Accounts of another wallet',
		otherWalletText: (network: string, index: number) =>
			`${network} account #${index} has a different address here: these accounts come from another wallet, or the same phrase with another passphrase. The two are never mixed. Funds are not affected either way.`,
		replace: (n: number) => `Replace the ${plural(n, 'account')} here`,
		keep: 'Keep the accounts here',
		kept: 'Nothing added. This browser keeps its accounts.',
		replaced: (n: number) =>
			`Replaced the accounts here with this wallet's ${plural(n, 'account')}.`,
		added: (n: number) => `Added ${plural(n, 'account')}.`,
		already: 'These accounts were already here.',
		title: 'Scan the phone',
		leadBefore: 'On the phone: ',
		leadConnect: 'Connect',
		leadMiddle: ' → choose networks → ',
		leadShow: 'Show code',
		leadAfter: '. Hold it in front of this camera.',
		again: 'Scan again'
	},
	send: {
		/** "Base (≈ $30,512)". */
		chainWith: (chain: string, what: string) => `${chain} (${what})`,
		moreChains: (n: number) => ` and ${n} more ${n === 1 ? 'chain' : 'chains'}`,
		enterAmount: 'Enter an amount.',
		noFreshRest: (start: number, end: number) =>
			`Airkeys has not seen an unused account to move the rest to. On the phone, turn the wheel to #${start}, then Connect → Accounts #${start} to #${end}, and scan it here.`,
		noFreshMove: (start: number, end: number) =>
			`Airkeys has not seen an unused account to move to. On the phone, turn the wheel to #${start}, then Connect → Accounts #${start} to #${end}, and scan it here.`,
		badIndex: 'An account number is a whole number from 0 to 2147483647.',
		restElsewhere: 'Move the rest to another account number.',
		moveElsewhere: 'Move to another account number.',
		notSigned: 'This code holds accounts, not a signed reply.',
		otherRequest: 'This reply answers another request. Show the phone this request again.',
		notBroadcast: (why: string) => `Signed, but not broadcast: ${why}`,
		moveTitle: (chain: string) => `Move everything${chain ? ` on ${chain}` : ''}`,
		from: (index: number) => `from #${index}`,
		sendTitle: (symbol: string, chain: string) => `Send ${symbol}${chain ? ` on ${chain}` : ''}`,
		whatMoves: 'What moves',
		nothingHere: 'Nothing on this chain.',
		movesEvm: (symbol: string) => `Every token, then the ${symbol} left after the network fees.`,
		movesBitcoin: 'Every coin, less the network fee.',
		to: 'To',
		yourAccount: 'Your account #',
		moveToAfter: ', whose key is still hidden. The phone derives its address itself.',
		moveToLabel: 'Account to move to',
		address: 'Address',
		amount: 'Amount',
		max: 'Max',
		available: (amount: string) => `Available: ${amount}`,
		fee: 'Network fee',
		slow: 'Slow',
		normal: 'Normal',
		fast: 'Fast',
		change: 'Change',
		changeBefore:
			'Bitcoin spends whole coins, so every coin of this account is spent. The change goes to account #',
		changeAfter: ', whose key is still hidden.',
		changeLabel: 'Account for the change',
		changeBack:
			'Bitcoin spends whole coins: what you do not send comes back to this account as change.',
		rest: 'The rest of this account',
		moveRest: 'Move it to account #',
		freshLabel: 'Fresh account number',
		recommended: 'Recommended',
		moveRestNote: (chain: string) =>
			`This send reveals the account's public key. Everything else it holds on ${chain} moves, in the same signing, to an account whose key is still hidden.`,
		leave: 'Leave it here',
		leaveNote:
			'Only the amount above is sent. The rest stays at this address, whose public key this send reveals.',
		elsewhereBefore: (chains: string) =>
			`This send reveals this account's key on every EVM chain, and it also holds funds on ${chains}. Afterwards, Home lists them under `,
		toMove: 'To move',
		elsewhereAfter: ', one signing per chain.',
		alreadyExposed:
			"This account's key is already exposed. Moving everything to a fresh account is safer.",
		preparing: 'Preparing…',
		review: 'Review',
		phoneWillSign: 'The phone will sign',
		feeAtMost: 'Network fee, at most',
		restFee: 'Of which, moving the rest',
		edit: 'Edit',
		show: 'Show to the phone',
		requestBefore: 'On the phone: ',
		scanRequest: 'Scan request',
		requestAfter: ', point it at this code, check every line, then hold to sign.',
		back: 'Back',
		scanReply: "Scan the phone's reply",
		codeSays: 'What this code says',
		replyLead: 'On the phone, after signing: hold its code in front of this camera.',
		showAgain: 'Show the request again',
		broadcasting: 'Broadcasting…',
		sent: 'Sent',
		refused: 'Refused',
		broadcastAgain: 'Broadcast again',
		done: 'Done'
	},
	settings: {
		title: 'Settings',
		currenciesFailed: (why: string) =>
			`The currencies did not load: ${why}. Totals stay in US dollars.`,
		enterUrl: 'Enter a web address: http://… or https://…',
		listFailed: (host: string) =>
			`The chain list at ${host} did not load. Enter the chain by hand below.`,
		addedChain: (name: string, testnet: boolean) =>
			`Added ${name}${testnet ? ' (a testnet: switch to Testnet to see it)' : ''}. The phone signs for it, with a warning that it is not in its list.`,
		enterChainId: 'Enter the chain id.',
		alreadyListed: 'This chain is already listed.',
		enterRpc: 'Enter the RPC URL, a web address: http://… or https://…',
		enterExplorer: 'Enter the explorer as a web address (https://…), or leave it empty.',
		wrongChain: (answered: number, id: number) =>
			`That endpoint serves chain ${answered}, not ${id}.`,
		/** "chain 8453", in a sentence. */
		chain: (id: number) => `chain ${id}`,
		/** "Chain 8453", at the start of a line. */
		chainCap: (id: number) => `Chain ${id}`,
		networks: 'Networks',
		search: 'Search a network — name, symbol or chain id',
		searchLabel: 'Search a network',
		listed: 'Listed',
		noMatch: (query: string) => `No network matches “${query}”.`,
		checkingEndpoints: 'Checking its endpoints…',
		endpoint: 'endpoint',
		answered: '(it answered for this chain)',
		explorer: (host: string) => ` · explorer ${host}`,
		tokens: 'Tokens (decimals read from the chain):',
		add: (name: string) => `Add ${name}`,
		sourceBefore: 'Networks come from ',
		sourceAfter: '.',
		hide: 'Hide',
		byHand: 'Enter one by hand',
		name: 'Name',
		chainId: 'Chain id',
		symbol: 'Coin symbol',
		rpcUrl: 'RPC URL',
		explorerUrl: 'Explorer URL',
		explorerPlaceholder: 'Explorer URL (https://…)',
		addChain: 'Add chain',
		ownEndpoint: 'Own endpoint',
		endpointButton: 'Endpoint',
		remove: 'Remove',
		endpointLabel: (name: string, kind: string) => `${name} endpoint (${kind})`,
		endpointsNote:
			'Airkeys reads balances and broadcasts through these endpoints. Point them at your own nodes for privacy; leave one empty for the default.',
		prices: 'Prices',
		showIn: 'Show totals in',
		pricesBefore:
			'Prices come from Chainlink price feeds, read through the Ethereum and BNB Smart Chain endpoints above, for the coins and tokens Airkeys lists. Other currencies use the rates of ',
		pricesAfter: '. Neither request includes an address.',
		fxLabel: 'Exchange-rate endpoint (rates from USD)',
		browser: 'This browser',
		browserNote:
			'The web app keeps only addresses and these settings, in this browser. It never sees a key.',
		forgetConfirm:
			'Forget every account in this browser? The funds are untouched; connect the phone again to see them.',
		forget: 'Forget all accounts',
		keepAccounts: 'Keep them',
		forgotten: 'Forgotten. Connect the phone again to see them.'
	},
	scan: {
		notAllowed:
			'The browser was not allowed to use the camera. Allow it for this page, then try again.',
		noCamera: 'No camera is available.',
		inUse: 'The camera is in use by another app or tab. Close it there, then try again.',
		notStarted: (why: string) => `The camera did not start: ${why}`,
		insecure:
			'The camera needs a secure page: open Airkeys over HTTPS (or from localhost), or as the browser extension.',
		noPicture: (why: string) => `The camera's picture did not start: ${why}`,
		readerStopped: (why: string) => `The code reader stopped: ${why}. Reload the page.`,
		didNotLoad: 'it did not load',
		receivingLabel: 'Receiving the code',
		receiving: 'Receiving…',
		found: 'Code found. Hold still.',
		hold: "Hold the phone's code up to the camera."
	},
	ui: {
		codeLabel: 'Animated code for the Airkeys phone',
		qrLabel: 'QR code of the address'
	},
	error: {
		notFound: 'There is no page here.',
		failed: 'This page did not load.',
		openApp: 'Open the web app'
	},
	protocol: {
		unknownField: {
			account: (field: string) => `The account has an unknown field “${field}”.`,
			message: (field: string) => `The message has an unknown field “${field}”.`,
			tx: (field: string) => `The signed transaction has an unknown field “${field}”.`
		},
		accountNotObject: 'An account is not an object.',
		notNetwork: (name: string) => `“${name}” is not a network.`,
		badIndex: 'An account number is not valid.',
		noAddress: 'An account has no address.',
		badAddress: 'An account address is not valid.',
		twice: 'An account is listed twice.',
		tooLarge: 'The message is larger than 1 MiB.',
		notAirkeys: 'This is not an Airkeys message.',
		version: (theirs: number, ours: number) =>
			`This message uses Airkeys protocol version ${theirs}. This app speaks version ${ours}.`,
		accountCount: (max: number) => `An accounts message lists 1 to ${max} accounts.`,
		badSigned: 'The signed message is not valid.',
		badTx: 'A signed transaction is not valid.',
		otherNetwork: 'The signed message names an account of another network.',
		isRequest: 'This is a request from a web app, not a reply from the phone.',
		badType: (type: string) => `“${type}” is not an Airkeys message type.`
	},
	addresses: {
		notEvm: (s: string) => `${s} is not an EVM address (0x and 40 hex digits).`,
		checksum: (s: string) => `${s} has a wrong checksum: a character is mistyped.`,
		notBitcoin: (s: string) => `${s} is not a valid Bitcoin address.`,
		notPayable: (s: string) => `${s} is not a Bitcoin mainnet address Airkeys pays to.`,
		notMainnet: (s: string) => `${s} is not a valid Bitcoin mainnet address.`
	},
	net: {
		noAnswer: (host: string) => `${host} did not answer`,
		late: (host: string) => `${host} did not answer in time`,
		noBatch: 'no answer to a batch of calls',
		badAnswer: 'an answer that does not fit the question'
	},
	bunker: {
		title: 'Bunker mode',
		label: 'Keep funds behind keys no one has seen',
		on: 'On: each send also moves what is left on that network to an account whose key is still hidden, in the same signing, and Home lists what to move. Every coin or token moved costs a network fee.',
		off: 'Off: a send moves only the amount you enter, Bitcoin change comes back to the same account, and you receive at one account, as with any cold wallet. Move all stays on each account page. Airkeys still reads which keys are exposed: turn bunker mode back on to see them.'
	},
	tokens: {
		title: 'Tokens',
		lead: 'Airkeys reads the tokens it lists on each network. Add any other ERC-20 token here, by name or by contract address.',
		network: 'Network',
		search: 'Search by name or symbol, or paste a contract address',
		loadingIndex: 'Loading the token list…',
		indexFailed: (why: string) =>
			`The token list did not load (${why}). Paste the contract address instead.`,
		reading: 'Reading the contract…',
		notToken: 'This address does not answer as an ERC-20 token on this network.',
		badSymbol: (symbol: string) =>
			`Its symbol, “${symbol}”, is not one the phone can show: 1 to 16 ASCII letters, digits or signs.`,
		listed: 'Airkeys lists this token already.',
		already: 'This token is added already.',
		decimals: (n: number) => `${n} decimals`,
		check:
			'Anyone can make a token with any name. Check the address against the project’s own site before you add it.',
		add: 'Add token',
		added: (symbol: string) => `Added ${symbol}. Its balances show on Home.`,
		note: 'Tokens added here are not priced, and the phone shows them as not listed, with their address.',
		yours: 'Added here',
		remove: 'Remove',
		missingBefore: 'A token missing? ',
		missingLink: 'Add it in Settings',
		missingAfter: '.'
	},
	chainData: {
		mismatch: 'The chain data does not match this chain id.',
		invalid: 'The chain data is not valid.',
		noEndpoint: 'None of its public endpoints answered. Enter one by hand.'
	},
	prices: {
		feedFailed: (chain: string, why: string) => `prices on ${chain}: ${why}`,
		noRate: (code: string) => `no exchange rate for ${code}`,
		rateFailed: (code: string, why: string) => `the exchange rate for ${code}: ${why}`
	},
	chains: {
		needsAccount: 'Moving everything needs an account to go to.',
		sendElsewhere:
			'Send to another address: coins sent back to this one would sit behind a revealed key.',
		/** One line of what the phone will sign: "Send 100 USDC to 0x…". */
		sendTo: (amount: string, to: string) => `Send ${amount} to ${to}`,
		moveTo: (amount: string, index: number) => `Move ${amount} to your account #${index}`,
		tooLittle: (held: string) =>
			`The account holds ${held}: too little for this amount and its fee.`,
		noCoins: 'This account holds no coins.',
		tooManyCoins: (n: number, max: number) =>
			`This account holds ${n} coins. A request spends all of them, and the phone signs at most ${max} at once.`,
		tooLittleAt: (held: string, rate: string) =>
			`The account holds ${held}: too little for this amount and its fee at ${rate} sat/vB.`,
		dust: (sat: number) => `The amount is below the network's dust limit of ${sat} sat.`,
		changeNeedsAccount: 'The change needs an account to go to.',
		changeBack: (amount: string) => `Change of ${amount} back to this account`,
		moveChange: (amount: string, index: number) =>
			`Move the change, ${amount}, to your account #${index}`,
		spendAll: (n: number, total: string) =>
			`Spend all ${plural(n, 'coin')} of this account (${total})`,
		tooLarge:
			"The coins' previous transactions are too large for one request: it would be over 1 MiB, the most the phone reads.",
		holds: (held: string) => `The account holds ${held}.`,
		feeNotCovered: 'The balance does not cover the network fee.',
		nothingToMove: 'Nothing to move: the balance does not cover a network fee.',
		stayBehind: (symbols: string) =>
			`One request holds at most 16 transactions, so ${symbols} stay at this address. Once this is signed and sent, move them with Move all.`,
		feesExceed: (fees: string, held: string) =>
			`The fees need up to ${fees}; the account holds ${held}.`
	}
};

export type Dict = typeof en;
