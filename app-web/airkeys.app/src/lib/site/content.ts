/** Everything the landing page says, in English and Chinese. Facts come from docs/ and the READMEs. */

import { launched, onSale, site } from './site';

/** The landing page's two languages. */
export type Route = '/' | '/zh/';

export interface Content {
	lang: 'en' | 'zh';
	htmlLang: string;
	path: Route;
	other: { path: Route; label: string; hreflang: string };
	meta: { title: string; description: string };
	nav: { how: string; security: string; pricing: string; faq: string; source: string; app: string };
	hero: {
		eyebrow: string;
		title: string;
		lead: string;
		primary: string;
		secondary: string;
		note: string;
	};
	/** Phone screenshots in the hero: files in static/screens/. */
	shots: { src: string; alt: string }[];
	facts: string[];
	why: {
		title: string;
		lead: string;
		head: [string, string];
		rows: [string, string][];
		/** The last row is Airkeys. */
		note: string;
	};
	how: {
		title: string;
		lead: string;
		flow: {
			phone: string;
			phoneNote: string;
			code: string;
			codeNote: string;
			web: string;
			webNote: string;
		};
		steps: { title: string; text: string }[];
	};
	bunker: { title: string; lead: string; points: { title: string; text: string }[]; alt: string };
	features: { title: string; lead: string; items: { title: string; text: string }[] };
	model: { title: string; head: [string, string]; rows: [string, string][]; points: string[] };
	networks: { title: string; lead: string; bitcoin: string; evm: string; more: string };
	web: {
		title: string;
		lead: string;
		points: string[];
		open: string;
		alt: string;
		/** The download button, then how to install it, around a link to the releases. */
		extension: string;
		install: string;
		releases: string;
		after: string;
	};
	platforms: { title: string; lead: string; android: string; ios: string; caption: string };
	open: {
		title: string;
		lead: string;
		/** `link.path` is a file in the repository, with an optional #anchor. */
		items: { title: string; text: string; link?: { label: string; path: string } }[];
		protocol: string;
		security: string;
		source: string;
	};
	pricing: {
		title: string;
		lead: string;
		build: {
			name: string;
			price: string;
			per: string;
			points: string[];
			action: string;
			guide: string;
		};
		store: { name: string; price: string; per: string; points: string[] };
		note: string;
	};
	faq: { title: string; items: { q: string; a: string }[] };
	cta: { title: string; text: string; soon: string; app: string };
	footer: {
		license: string;
		security: string;
		protocol: string;
		warning: string;
		terms: string;
		privacy: string;
	};
}

export const en: Content = {
	lang: 'en',
	htmlLang: 'en',
	path: '/',
	other: { path: '/zh/', label: '中文', hreflang: 'zh-Hans' },
	meta: {
		title: 'Airkeys: a cold wallet that shares addresses only',
		description:
			'Airkeys turns a spare offline phone into a cold wallet for Bitcoin, Ethereum and EVM chains. It shares addresses, never public keys, and signs only transfers you have read. Open source.'
	},
	nav: {
		how: 'How it works',
		security: 'Security',
		pricing: 'Pricing',
		faq: 'FAQ',
		source: 'Source',
		app: 'Web companion'
	},
	hero: {
		eyebrow: 'Open source · Offline phone · Bitcoin & EVM',
		title: 'A cold wallet that never shows a public key.',
		lead: 'Airkeys runs on a spare phone kept offline. It gives out your addresses and nothing else, so the keys behind them stay unknown until you spend. A quantum computer needs a public key to work on.',
		primary: 'Get the phone app',
		secondary: 'How it works',
		note: 'Coming to Google Play and the App Store.'
	},
	shots: [
		{ src: 'home.png', alt: 'An account’s Bitcoin and Ethereum addresses on the phone' },
		{ src: 'code.png', alt: 'The phone showing its accounts as an animated code' }
	],
	facts: [
		'Addresses only',
		'Works only offline',
		'Nothing stored',
		'Hardened paths',
		'Readable JSON',
		'MIT licence'
	],
	why: {
		title: 'Most cold wallets give the computer your public keys',
		lead: 'A quantum computer that breaks elliptic curves can turn a public key into its private key. An address is a hash of the public key, so an account that has never spent keeps its key hidden. Most ways of connecting a cold wallet send the keys anyway.',
		head: ['How it connects', 'What the computer receives'],
		rows: [
			['Ledger, through Ledger Live', 'The public key with every address'],
			['Trezor, connected to MetaMask', 'An extended public key, which gives every account’s key'],
			['QR air-gapped wallets', 'Extended public keys, synced once'],
			['Airkeys', 'Addresses only']
		],
		note: 'Each Airkeys account is on its own hardened path, so a key revealed by spending says nothing about the others.'
	},
	how: {
		title: 'How it works',
		lead: 'The offline phone holds your keys and signs. The web companion on your computer knows only your addresses. They exchange animated codes: one screen shows a code, the other device’s camera reads it.',
		flow: {
			phone: 'Offline phone',
			phoneNote: 'keys, in memory only',
			code: 'Animated code',
			codeNote: 'readable JSON, both ways',
			web: 'Web companion',
			webNote: 'addresses, balances, broadcast'
		},
		steps: [
			{
				title: 'Take a phone offline',
				text: 'Install Airkeys on a spare phone, turn on airplane mode and switch off Wi-Fi and Bluetooth. Airkeys checks what each radio is doing, not only its switch, and waits until all are off.'
			},
			{
				title: 'Enter your phrase',
				text: 'Type your BIP-39 recovery phrase or scan your SeedQR. It stays in memory until you close the wallet and is never written to the phone.'
			},
			{
				title: 'Connect',
				text: 'The phone shows your addresses as a code, up to 100 accounts at once. The web companion reads it with the camera and shows each account’s balances on every chain.'
			},
			{
				title: 'Send',
				text: 'The web companion shows a transfer as a code. The phone reads it, lists every recipient, amount, chain and fee, and signs while you hold the button. The web companion broadcasts the result.'
			}
		]
	},
	bunker: {
		title: 'Bunker mode',
		lead: 'Spending from an account reveals its key. By default, the same signing moves what is left to a new account whose key has never been seen.',
		points: [
			{
				title: 'Bunker and Exposed',
				text: 'The web companion splits your total into funds behind keys never revealed and funds behind keys that have signed. Exposed funds have a Move button.'
			},
			{
				title: 'Separate paths',
				text: 'Every account derives under Airkeys’ own first step, 65738275′ (“AIRK”), with every step hardened. No extended key that a standard wallet exports leads to them.'
			},
			{
				title: 'Optional',
				text: 'A send can leave the rest where it is, and bunker mode can be turned off to use Airkeys as a plain cold wallet: Bitcoin change then comes back to the same account, and you receive at one address.'
			}
		],
		alt: 'The web companion’s total, split into Bunker and Exposed'
	},
	features: {
		title: 'Protections',
		lead: 'Keys stay on one offline phone, and you see exactly what you sign.',
		items: [
			{
				title: 'Enforced air gap',
				text: 'Wi-Fi, Bluetooth, mobile data and network connections are checked by what the phone observes. If a radio comes back on, everything pauses.'
			},
			{
				title: 'Nothing stored',
				text: 'No account, file or backup. The Android app has no internet permission. Closing the wallet removes the phrase from memory.'
			},
			{
				title: 'Clear signing',
				text: 'The phone builds every transaction from readable fields, signs only transfers, and shows each recipient, amount and fee first.'
			},
			{
				title: 'Readable codes',
				text: 'Every message is plain JSON. Any Lumen Code reader can show you that a code carries no key.'
			},
			{
				title: 'Private screens',
				text: 'Android blocks screenshots and recordings of the phrase; iPhone hides it from recordings and the app switcher. Keyboards are told not to learn it, and iPhone refuses third-party keyboards.'
			},
			{
				title: 'One core',
				text: 'Android and iPhone run the same Rust core, tested against Bitcoin Core and a fork of Ethereum mainnet.'
			}
		]
	},
	model: {
		title: 'What protects you',
		head: ['If someone has', 'What protects your funds'],
		rows: [
			[
				'your computer and the web companion',
				'They know only addresses, and the phone shows each transfer before signing'
			],
			['a quantum computer', 'Accounts that have never spent: their keys are unknown'],
			['your phone, with Airkeys closed', 'Nothing is stored on it'],
			[
				'your recovery phrase',
				'Nothing. Airkeys neither creates nor stores it, so protecting it is up to you'
			]
		],
		points: [
			'Airkeys has not had a third-party audit. Start with small amounts.',
			'Use a clean phone: Airkeys cannot protect the phrase from malware already on it.'
		]
	},
	networks: {
		title: 'Networks',
		lead: 'One recovery phrase gives Bitcoin and EVM accounts.',
		bitcoin: 'BTC to any address type, from native SegWit accounts.',
		evm: 'ETH and ERC-20 tokens, with the same address on',
		more: 'and any EVM chain you add.'
	},
	web: {
		title: 'The web companion',
		lead: 'It works with the phone app and is not a wallet: it never sees, asks for or creates a recovery phrase, and it cannot sign. It shows the balances of the addresses your phone shared, prepares transfers for the phone and broadcasts what the phone signed. It is a static site that connects only to the endpoints you choose. Use it at airkeys.app, host it yourself, or load it as a browser extension.',
		points: [
			'Totals split into Bunker and Exposed, across accounts and chains',
			'Transfers prepared from live chain data',
			'Your own node for any chain',
			'Mainnet and testnet kept apart; EVM chains added from a list'
		],
		open: 'Open the web companion',
		alt: 'The web companion: balances, and a transfer shown to the phone as a code',
		extension: 'Download the browser extension',
		install:
			'For Chrome, Edge and Brave. Unzip it, open chrome://extensions, turn on Developer mode and choose Load unpacked. It does not update itself: new versions are on the ',
		releases: 'releases page',
		after: ', with their checksums.'
	},
	platforms: {
		title: 'Android and iPhone',
		lead: 'Both apps use the same Rust core and the same test vectors, so a phrase gives the same accounts and a request the same signature on either phone.',
		android: 'Android 8 or later',
		ios: 'iOS 17 or later',
		caption: 'Tested on iPhone 11 and 15 Pro, Samsung Galaxy S22 and Redmi K40.'
	},
	open: {
		title: 'Open source and recoverable',
		lead: 'You can get your funds back without Airkeys.',
		items: [
			{
				title: 'Fixed protocol',
				text: 'Every message between the phone and the web companion is specified, and version 1 will not change, so old and new apps keep working together.'
			},
			{
				title: 'Recovery without Airkeys',
				text: 'Your funds are your phrase on two documented paths. Bitcoin Core and Foundry can recover them; the steps are tested against the addresses Airkeys shows.',
				link: { label: 'Recovery guide', path: 'docs/RECOVERY.md' }
			},
			{
				title: 'Independent checks',
				text: 'Addresses are checked against independent tools. Signed transactions are mined by Bitcoin Core and executed on a fork of Ethereum mainnet.',
				link: { label: 'What is verified', path: 'docs/DESIGN.md#what-is-verified' }
			},
			{
				title: 'MIT License',
				text: 'The phone apps, the core and the web companion are all open source.'
			}
		],
		protocol: 'Protocol',
		security: 'Security policy',
		source: 'Source code'
	},
	pricing: {
		title: 'Pricing',
		lead: 'The store version and a build from source are the same app. The web companion is free.',
		build: {
			name: 'Build it yourself',
			price: 'Free',
			per: 'forever',
			points: [
				'Full source, MIT License',
				'Same features and accounts as the store version',
				'Needs Android Studio or Xcode'
			],
			action: 'How to build',
			guide: 'README.md#build'
		},
		store: {
			name: 'Google Play and the App Store',
			price: site.price,
			per: 'once',
			points: [
				'Official signed builds, only on these two stores',
				'Updates through the store, which you can turn off',
				'No subscription, in-app purchases, ads or account',
				'Funds further development'
			]
		},
		note: 'One price worldwide, shown in your currency. Android and iPhone are bought separately.'
	},
	faq: {
		title: 'Questions',
		items: [
			{
				q: 'If it is open source, why pay?',
				a: 'You don’t have to: you can build it for free. Buying it gets you a signed build with updates, and pays for maintenance.'
			},
			{
				q: 'Can I use the web companion without the phone?',
				a: 'Only to view balances. It never sees a recovery phrase and cannot sign; every transfer is signed on the phone.'
			},
			{
				q: 'Does Airkeys create my recovery phrase?',
				a: 'No. Bring a standard BIP-39 phrase of 12 to 24 words, with or without a passphrase. Airkeys keeps it in memory while the wallet is open and never stores it.'
			},
			{
				q: 'Why a spare phone?',
				a: 'The phone that signs must stay offline. Airkeys refuses to work while any radio or network connection is on.'
			},
			{
				q: 'Will other wallets show the same addresses?',
				a: 'No. Airkeys uses its own derivation paths, so a wallet importing the same phrase shows different, empty addresses. Tools that accept a full hardened path find yours.'
			},
			{
				q: 'What if Airkeys disappears?',
				a: 'Follow the recovery guide: Bitcoin Core and Foundry find every account from your phrase and the two documented paths.'
			},
			{
				q: 'Do I have to move my funds after every transfer?',
				a: 'No. Bunker mode, on by default, moves what is left on a network to an account whose key is still hidden, and shows the extra fee before you sign. Turn it off in the web companion’s Settings to use Airkeys as a plain cold wallet: a send then moves only what you enter.'
			},
			{
				q: 'Is a quantum computer a real threat?',
				a: 'Not today. For funds held for years, sharing only addresses costs nothing, and bunker mode keeps unspent funds behind keys no one has seen.'
			},
			{
				q: 'Which networks and tokens?',
				a: 'Bitcoin, and coins and ERC-20 tokens on Ethereum, Base, Arbitrum, OP, Polygon, BNB Smart Chain, Avalanche, Monad and 15 more EVM networks, their testnets, and any EVM chain you add. Tokens Airkeys does not list are signed with a warning.'
			},
			{
				q: 'How do I know my copy is genuine?',
				a: 'Install it only from the official store listings or build it from source. Keep the phone offline and turn off automatic updates.'
			}
		]
	},
	cta: {
		title: 'Airkeys for Android and iPhone',
		text: launched
			? site.price + ' once from ' + onSale.join(' or ') + ', or free to build.'
			: 'The first release is in preparation: ' +
				site.price +
				' once from the stores, or free to build.',
		soon: 'Coming soon',
		app: 'Open the web companion'
	},
	footer: {
		license: 'Open source under the MIT License.',
		security: 'Report a vulnerability',
		protocol: 'Protocol',
		warning: 'Not audited by a third party.',
		terms: 'Terms of Service',
		privacy: 'Privacy Policy'
	}
};

export const zh: Content = {
	lang: 'zh',
	htmlLang: 'zh-Hans',
	path: '/zh/',
	other: { path: '/', label: 'English', hreflang: 'en' },
	meta: {
		title: 'Airkeys：只分享地址的冷钱包',
		description:
			'Airkeys 把一台断网的闲置手机变成冷钱包，支持比特币、以太坊和 EVM 链。它只分享地址，不分享公钥，只签你看过的转账。开源。'
	},
	nav: {
		how: '原理',
		security: '安全',
		pricing: '定价',
		faq: '常见问题',
		source: '源码',
		app: '网页助手'
	},
	hero: {
		eyebrow: '开源 · 离线手机 · 比特币与 EVM',
		title: '从不暴露公钥的冷钱包。',
		lead: 'Airkeys 运行在一台断网的闲置手机上。它只对外提供地址，地址背后的公钥在你转出之前无人知晓。量子计算机需要公钥才能下手。',
		primary: '获取手机 App',
		secondary: '原理',
		note: '即将上架 Google Play 和 App Store。'
	},
	shots: [
		{ src: 'home.png', alt: '手机上一个账户的比特币和以太坊地址' },
		{ src: 'code.png', alt: '手机以动态码展示账户' }
	],
	facts: ['只给地址', '只在离线时工作', '不存储', '硬化派生', '可读的 JSON', 'MIT 许可证'],
	why: {
		title: '大多数冷钱包会把公钥交给电脑',
		lead: '能破解椭圆曲线的量子计算机，可以从公钥算出私钥。地址是公钥的哈希，所以从未转出过的账户，公钥不会暴露。但大多数冷钱包连接电脑时，还是会把公钥发过去。',
		head: ['连接方式', '电脑拿到的'],
		rows: [
			['Ledger，通过 Ledger Live', '每个地址都附带公钥'],
			['Trezor，连接 MetaMask', '扩展公钥，可推出所有账户的公钥'],
			['二维码隔离冷钱包', '一次同步的扩展公钥'],
			['Airkeys', '只有地址']
		],
		note: 'Airkeys 的每个账户都在各自的硬化路径上，一个账户转出后暴露的公钥，推不出其他账户。'
	},
	how: {
		title: '原理',
		lead: '离线手机保管密钥并签名，电脑上的网页助手只知道地址。两者通过动态码交换信息：一边屏幕显示，另一边摄像头读取。',
		flow: {
			phone: '离线手机',
			phoneNote: '密钥只在内存里',
			code: '动态码',
			codeNote: '可读的 JSON，双向',
			web: '网页助手',
			webNote: '地址、余额、广播'
		},
		steps: [
			{
				title: '让手机断网',
				text: '在闲置手机上安装 Airkeys，打开飞行模式，关闭 Wi-Fi 和蓝牙。Airkeys 检查每个无线模块的实际状态，而不只是开关，全部关闭后才开始工作。'
			},
			{
				title: '输入助记词',
				text: '输入 BIP-39 助记词，或扫描 SeedQR。助记词只在内存中，关闭钱包即清除，从不写入手机。'
			},
			{
				title: '连接',
				text: '手机把地址显示成动态码，一次最多 100 个账户。网页助手用摄像头读取，显示每个账户在各条链上的余额。'
			},
			{
				title: '转出',
				text: '网页助手把转账显示成动态码。手机读取后列出每个收款方、金额、链和手续费，你按住按钮时签名，再由网页助手广播。'
			}
		]
	},
	bunker: {
		title: '地堡模式',
		lead: '从一个账户转出会暴露它的公钥。默认情况下，同一次签名会把剩余资产转到一个公钥从未暴露过的新账户。',
		points: [
			{
				title: '地堡与已暴露',
				text: '网页助手把总资产分成两部分：公钥从未暴露的，和公钥已经签过名的。已暴露的资产旁有“转移”按钮。'
			},
			{
				title: '独立的派生路径',
				text: '每个账户都派生自 Airkeys 自己的第一步 65738275′（即 “AIRK”），每一步都硬化。标准钱包导出的扩展公钥推不出这些账户。'
			},
			{
				title: '可选',
				text: '转出时可以把剩余资产留在原账户；也可以关掉地堡模式，把 Airkeys 当普通冷钱包用：Bitcoin 的找零会退回同一个账户，收款也一直用同一个地址。'
			}
		],
		alt: '网页助手的总资产，分为地堡与已暴露'
	},
	features: {
		title: '安全设计',
		lead: '密钥只在一台离线手机上，签名前你能看清每一项内容。',
		items: [
			{
				title: '强制断网',
				text: 'Wi-Fi、蓝牙、移动数据和网络连接都按手机实际观察到的状态检查。任何一个恢复，一切暂停。'
			},
			{
				title: '不存储',
				text: '没有账户、文件和备份。Android 版没有联网权限。关闭钱包后，助记词从内存中清除。'
			},
			{
				title: '明文签名',
				text: '手机用可读的字段构造每一笔交易，只签转账，并先显示每个收款方、金额和手续费。'
			},
			{
				title: '可读的动态码',
				text: '每条消息都是纯 JSON。任何 Lumen Code 读取器都能让你确认动态码里没有密钥。'
			},
			{
				title: '隐私屏幕',
				text: 'Android 禁止对助记词截屏和录屏；iPhone 在录屏和多任务界面中隐藏它。输入法被告知不要学习，iPhone 拒绝第三方输入法。'
			},
			{
				title: '同一个内核',
				text: 'Android 和 iPhone 使用同一个 Rust 内核，已对照 Bitcoin Core 和以太坊主网分叉测试。'
			}
		]
	},
	model: {
		title: '什么在保护你',
		head: ['别人拿到了', '保护资产的是'],
		rows: [
			['你的电脑和网页助手', '它们只知道地址，手机签名前会显示每笔转账'],
			['量子计算机', '从未转出过的账户：公钥无人知晓'],
			['关闭 Airkeys 后的手机', '手机上什么都没存'],
			['你的助记词', '没有。Airkeys 不生成也不保存助记词，请自己保管好']
		],
		points: [
			'Airkeys 尚未经过第三方审计，请先用小额试用。',
			'请使用干净的手机：手机上已有的恶意软件，Airkeys 防不住。'
		]
	},
	networks: {
		title: '支持的网络',
		lead: '一套助记词同时对应比特币和 EVM 账户。',
		bitcoin: 'BTC，可转到任意地址类型，使用原生隔离见证账户。',
		evm: 'ETH 和 ERC-20 代币，以下各链地址相同：',
		more: '以及你添加的任何 EVM 链。'
	},
	web: {
		title: '网页助手',
		lead: '网页助手配合手机 App 使用，不是钱包：它从不接触、索要或生成助记词，也无法签名。它显示手机分享的地址的余额，准备转账交给手机签名，并广播手机签好的交易。它是只连接你指定节点的静态网站，可以直接用 airkeys.app，也可以自己部署，或作为浏览器扩展加载。',
		points: [
			'按地堡与已暴露汇总各账户、各链的资产',
			'根据链上实时数据准备转账',
			'任何链都可以使用自己的节点',
			'主网和测试网分开；可从列表添加 EVM 链'
		],
		open: '打开网页助手',
		alt: '网页助手：余额，以及以动态码交给手机的一笔转账',
		extension: '下载浏览器扩展',
		install:
			'适用于 Chrome、Edge 和 Brave。解压后打开 chrome://extensions，开启“开发者模式”，选择“加载已解压的扩展程序”。扩展不会自动更新，新版本和校验值在',
		releases: '发布页面',
		after: '。'
	},
	platforms: {
		title: 'Android 与 iPhone',
		lead: '两个 App 使用同一个 Rust 内核和同一套测试向量，同一套助记词在两台手机上得到相同的账户，同一笔请求得到相同的签名。',
		android: 'Android 8 及以上',
		ios: 'iOS 17 及以上',
		caption: '已在 iPhone 11、iPhone 15 Pro、三星 Galaxy S22 和红米 K40 上测试。'
	},
	open: {
		title: '开源，可独立恢复',
		lead: '不用 Airkeys 也能找回资产。',
		items: [
			{
				title: '固定的协议',
				text: '手机和网页助手之间的每条消息都有规范，版本 1 不会再改，新旧 App 可以互通。'
			},
			{
				title: '不用 Airkeys 恢复',
				text: '你的资产就是助记词加两条公开的派生路径。Bitcoin Core 和 Foundry 都能恢复，步骤已对照 Airkeys 显示的地址测试。',
				link: { label: '恢复指南', path: 'docs/RECOVERY.md' }
			},
			{
				title: '独立核验',
				text: '地址对照独立工具核验。签好的交易由 Bitcoin Core 打包，并在以太坊主网分叉上执行。',
				link: { label: '验证了哪些内容', path: 'docs/DESIGN.md#what-is-verified' }
			},
			{
				title: 'MIT 许可证',
				text: '手机 App、内核和网页助手全部开源。'
			}
		],
		protocol: '协议',
		security: '安全政策',
		source: '源码'
	},
	pricing: {
		title: '定价',
		lead: '商店版和自己编译的是同一个 App。网页助手免费。',
		build: {
			name: '自己编译',
			price: '免费',
			per: '永久',
			points: ['完整源码，MIT 许可证', '功能和账户与商店版相同', '需要 Android Studio 或 Xcode'],
			action: '怎样编译',
			guide: 'README.md#build'
		},
		store: {
			name: 'Google Play 与 App Store',
			price: site.price,
			per: '一次性',
			points: [
				'官方签名版本，只在这两家商店发布',
				'通过商店更新，可以关闭',
				'无订阅、内购、广告和账户',
				'用于后续开发'
			]
		},
		note: '全球统一定价，按你所在地区的货币显示。Android 和 iPhone 需分别购买。'
	},
	faq: {
		title: '常见问题',
		items: [
			{
				q: '开源为什么还要付费？',
				a: '不必付费，可以自己免费编译。购买得到的是带更新的官方签名版本，也为维护出一份力。'
			},
			{
				q: '不用手机，能只用网页助手吗？',
				a: '只能查看余额。它从不接触助记词，也无法签名；每一笔转账都在手机上签名。'
			},
			{
				q: 'Airkeys 会生成助记词吗？',
				a: '不会。请使用一套标准 BIP-39 助记词，12 到 24 个词，有没有密码短语都可以。Airkeys 只在钱包打开时把它放在内存里，从不保存。'
			},
			{
				q: '为什么要用闲置手机？',
				a: '签名的手机必须一直断网。只要有无线模块或网络连接开着，Airkeys 就不工作。'
			},
			{
				q: '其他钱包会显示同样的地址吗？',
				a: '不会。Airkeys 使用自己的派生路径，其他钱包导入同一套助记词会显示别的、空的地址。支持完整硬化路径的工具能找到你的账户。'
			},
			{
				q: 'Airkeys 不在了怎么办？',
				a: '按恢复指南操作：Bitcoin Core 和 Foundry 可以根据助记词和两条公开路径找回每个账户。'
			},
			{
				q: '每次转账后都要转移资产吗？',
				a: '不用。地堡模式默认开启，会把这条链上剩下的资产转到公钥未暴露的账户，签名前会显示多出的手续费。在网页助手的设置里关掉它，Airkeys 就是一个普通冷钱包：转出时只转你填写的金额。'
			},
			{
				q: '量子计算机真的是威胁吗？',
				a: '现在还不是。对长期持有的资产来说，只分享地址没有代价，地堡模式让没花掉的资产始终在无人见过的公钥后面。'
			},
			{
				q: '支持哪些网络和代币？',
				a: '比特币；以及以太坊、Base、Arbitrum、OP、Polygon、BNB 智能链、Avalanche、Monad 等 23 个 EVM 网络和它们的测试网，还有你添加的任何 EVM 链上的原生币与 ERC-20 代币。Airkeys 未收录的代币也能签，但会提示。'
			},
			{
				q: '怎么确认装的是正版？',
				a: '只从官方商店页面安装，或从源码编译。手机保持断网，并关闭自动更新。'
			}
		]
	},
	cta: {
		title: 'Airkeys 手机 App',
		text: launched
			? '在 ' + onSale.join(' 或 ') + ' ' + site.price + ' 一次买断，或自己免费编译。'
			: '首个版本正在准备中：商店版 ' + site.price + ' 一次买断，或自己免费编译。',
		soon: '即将推出',
		app: '打开网页助手'
	},
	footer: {
		license: '以 MIT 许可证开源。',
		security: '报告安全漏洞',
		protocol: '协议',
		warning: '尚未经过第三方审计。',
		terms: '服务条款',
		privacy: '隐私政策'
	}
};
