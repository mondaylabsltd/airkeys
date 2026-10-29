/** The terms of service and the privacy policy, in English and Chinese. Facts come from docs/ and the code. */

import { site } from './site';

export interface LegalDoc {
	title: string;
	description: string;
	updated: string;
	intro: string;
	sections: { title: string; paragraphs: string[] }[];
}

export interface Legal {
	terms: LegalDoc;
	privacy: LegalDoc;
	/** Labels around the documents. */
	ui: {
		home: string;
		terms: string;
		privacy: string;
		back: string;
		contact: string;
		contactText: string;
	};
}

export const en: Legal = {
	ui: {
		home: 'Airkeys',
		terms: 'Terms of Service',
		privacy: 'Privacy Policy',
		back: '← Back to Airkeys',
		contact: 'Contact',
		contactText: 'Questions about these terms or this policy, and security reports:'
	},
	terms: {
		title: 'Terms of Service',
		description: 'The terms for using the Airkeys phone apps and the Airkeys web companion.',
		updated: 'Last updated: 27 October 2026',
		intro: `Airkeys is made by ${site.company} (“we”). These terms cover the Airkeys phone apps for Android and iPhone, the Airkeys web companion at airkeys.app and as a browser extension, and this website (together, “Airkeys”). By using Airkeys you accept them. If you do not, do not use Airkeys.`,
		sections: [
			{
				title: 'What Airkeys is',
				paragraphs: [
					'Airkeys is self-custody software. The phone app reads a recovery phrase you already have, keeps it in memory while the wallet is open, and signs transfers you approve on the phone. The web companion shows what the addresses your phone shared hold, prepares transfers for the phone to sign and broadcasts what the phone signed.',
					'Airkeys is not a bank, exchange, broker or custodian. We never hold your funds, your recovery phrase or your keys, and we cannot see, move, freeze or recover them. The web companion never sees a recovery phrase, never creates a wallet and cannot sign.'
				]
			},
			{
				title: 'Your responsibilities',
				paragraphs: [
					'You alone control your funds. Keep your recovery phrase, and any passphrase, safe and backed up independently: Airkeys does not create or store them, and no one can restore them for you.',
					'Read every transfer on the phone before you hold to sign: the recipient, the amount, the network and the fee. A signed transaction broadcast to a blockchain cannot be reversed.',
					'Use a phone you trust, kept offline. Airkeys cannot protect a phrase from malware already on the phone, or from anyone who can see its screen.',
					'Airkeys is young and has had no third-party audit. Start with small amounts and test recovery before you rely on it.'
				]
			},
			{
				title: 'Licence',
				paragraphs: [
					'The source code of Airkeys is published under the MIT License, which governs the code itself. You may build, use and modify it under that licence.',
					'Builds of the phone apps bought from Google Play or the App Store are licensed to you for personal use under these terms and the store’s own terms. The names “Airkeys” and its logo identify the official builds; do not use them in a way that suggests a build of yours is ours.'
				]
			},
			{
				title: 'Purchases',
				paragraphs: [
					`The phone apps cost ${site.price} once on Google Play and the App Store, each store showing the price in your currency. Payment, refunds and receipts are handled by the store under its own terms; we never see your payment details. Android and iPhone are bought separately. The web companion and building from source are free.`
				]
			},
			{
				title: 'Third-party services',
				paragraphs: [
					'The web companion reads balances and broadcasts transactions through blockchain endpoints: public ones by default, or your own, set in Settings. It may fetch exchange rates and the details of a network you choose to add. These services are run by others, under their own terms; we do not control them or guarantee that they are available or correct.',
					'Blockchains, tokens and their networks are not ours either. Their fees, delays, forks and failures are outside our control.'
				]
			},
			{
				title: 'Acceptable use',
				paragraphs: [
					'Use Airkeys only in ways that are lawful where you are, including laws on sanctions, taxes and money transmission. Do not use it to harm others or to interfere with the services it relies on.'
				]
			},
			{
				title: 'No advice',
				paragraphs: [
					'Nothing in Airkeys or on this website is financial, investment, tax or legal advice. Prices and totals the web companion shows are estimates and may be wrong.'
				]
			},
			{
				title: 'No warranty',
				paragraphs: [
					'Airkeys is provided “as is” and “as available”, without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose and non-infringement. We do not promise that it is free of errors, that it will always be available, or that it will meet your needs.'
				]
			},
			{
				title: 'Limitation of liability',
				paragraphs: [
					'To the fullest extent the law allows, we are not liable for any indirect, incidental, special or consequential loss, or for any loss of funds, keys, data or profits, arising from your use of Airkeys or your inability to use it, including mistakes in transfers you signed and the actions of third-party services. Where the law does not allow this exclusion, our total liability is limited to the amount you paid for the app.',
					'Nothing in these terms limits rights that consumer law gives you and that cannot be waived.'
				]
			},
			{
				title: 'If Airkeys goes away',
				paragraphs: [
					'Your funds never depend on us. They are your recovery phrase on two documented derivation paths, and the recovery guide in the source repository shows how Bitcoin Core and Foundry find every account without Airkeys. Keep a copy of the source and of the app you use.'
				]
			},
			{
				title: 'Changes',
				paragraphs: [
					'We may update these terms, for example when Airkeys changes. The date at the top says when they last changed. Continuing to use Airkeys after a change means you accept the new terms.'
				]
			}
		]
	},
	privacy: {
		title: 'Privacy Policy',
		description:
			'What Airkeys collects: the phone apps and the web companion nothing about you; the website counts visits.',
		updated: 'Last updated: 27 October 2026',
		intro: `Airkeys is made by ${site.company} (“we”). It is built to know as little as possible. The phone apps and the web companion have no accounts, analytics, advertising or tracking, and we never receive your recovery phrase, your keys or your addresses. This website counts visits. This policy explains what each part of Airkeys handles, and where it goes.`,
		sections: [
			{
				title: 'The phone apps',
				paragraphs: [
					'The phone apps work only while every radio is off, and send nothing anywhere: the Android app does not even have the permission to use the internet. Your recovery phrase and passphrase stay in the phone’s memory while the wallet is open and are wiped when you close it; nothing is written to the phone’s storage or included in backups.',
					'The camera reads codes — the web companion’s, or a SeedQR — on the phone itself. Images are not stored and never leave the phone. On iPhone, Airkeys asks for Bluetooth permission only to check that Bluetooth is off; it never uses Bluetooth.',
					'Codes the phone shows carry addresses and signed transactions, never a key. You choose which accounts to show.'
				]
			},
			{
				title: 'The web companion',
				paragraphs: [
					'The web companion runs in your browser. It keeps the addresses your phone shared and your settings in your browser’s local storage, on your computer only, until you remove them. It sets no cookies and loads no analytics or third-party scripts. The camera is used in the browser to read the phone’s codes; images are not uploaded or stored.',
					'To show balances and send transactions, your browser connects directly to blockchain endpoints: by default public services listed in Airkeys (such as mempool.space, blockstream.info and publicnode.com), or the nodes you set in Settings. Those services see your IP address and the addresses asked about, and can tell that addresses asked about together belong together. Using your own nodes avoids this.',
					'To show values in currencies other than US dollars, the web companion fetches exchange rates from Vela’s exchange-rate service; when you add a network or a token, it fetches its details from ethereum-data.getvela.app, and it shows token and network logos from the same site. None of these requests includes an address. Token prices in US dollars come from Chainlink feeds, read through the same blockchain endpoints.'
				]
			},
			{
				title: 'This website',
				paragraphs: [
					'The server that delivers airkeys.app’s files may keep standard technical logs, such as IP address, time and page requested, for security and operation, for a limited time.',
					'The landing page and these documents count visits with Rybbit, an open-source analytics tool hosted at tj.appsdata.org. It records the pages you view and their query parameters, the page that linked you here, the links you follow to other sites, your browser, language, screen size and approximate location (from your IP address), and keeps a random visitor ID in your browser’s local storage. It sets no cookies. The web companion (airkeys.app/app/) and the browser extension do not load it.'
				]
			},
			{
				title: 'App stores and payments',
				paragraphs: [
					'If you buy the phone app, Google Play or the App Store processes your payment and handles your account under their own privacy policies. They send us the sales reports every developer receives, which may include your country or region and the order details, but never your payment details or anything about your wallet.'
				]
			},
			{
				title: 'What we do not do',
				paragraphs: [
					'We do not sell or share personal data, build profiles, show advertising or track you across sites or apps. Apart from the visit counts above, we do not collect personal data; to ask about those, write to us. To erase what the web companion keeps, use “Forget all accounts” in Settings or clear the site’s data in your browser.'
				]
			},
			{
				title: 'Email',
				paragraphs: [
					'If you write to us, we use your address and your message only to reply, and keep them only as long as the conversation needs.'
				]
			},
			{
				title: 'Children',
				paragraphs: [
					'Airkeys is not directed at children and does not knowingly handle their data.'
				]
			},
			{
				title: 'Changes',
				paragraphs: [
					'If what Airkeys handles changes, we update this policy and the date at the top. The source code is public, so you can always check what the apps actually do.'
				]
			}
		]
	}
};

export const zh: Legal = {
	ui: {
		home: 'Airkeys',
		terms: '服务条款',
		privacy: '隐私政策',
		back: '← 返回 Airkeys',
		contact: '联系我们',
		contactText: '关于本条款或本政策的问题，以及安全问题报告：'
	},
	terms: {
		title: '服务条款',
		description: '使用 Airkeys 手机 App 和 Airkeys 网页助手的条款。',
		updated: '最后更新：2026 年 10 月 27 日',
		intro: `Airkeys 由 ${site.company}（下称“我们”）开发。本条款适用于 Android 和 iPhone 上的 Airkeys 手机 App、airkeys.app 上的 Airkeys 网页助手及其浏览器扩展，以及本网站（合称“Airkeys”）。使用 Airkeys 即表示你接受本条款；如不接受，请不要使用。`,
		sections: [
			{
				title: 'Airkeys 是什么',
				paragraphs: [
					'Airkeys 是自托管软件。手机 App 读取你已有的助记词，在钱包打开期间把它保存在内存中，并签署你在手机上确认的转账。网页助手显示手机分享的地址里有什么资产，准备转账交给手机签名，并广播手机签好的交易。',
					'Airkeys 不是银行、交易所、经纪商或托管方。我们从不持有你的资产、助记词或密钥，也无法查看、转移、冻结或找回它们。网页助手从不接触助记词、不生成钱包，也无法签名。'
				]
			},
			{
				title: '你的责任',
				paragraphs: [
					'只有你能掌控自己的资产。请妥善保管并另外备份你的助记词和密码短语：Airkeys 既不生成也不保存它们，没有任何人能替你恢复。',
					'按住签名之前，请在手机上逐项核对每笔转账：收款方、金额、网络和手续费。已签名并广播到区块链的交易无法撤销。',
					'请使用你信任的、保持断网的手机。手机上已有的恶意软件，或能看到屏幕的人，Airkeys 都防不住。',
					'Airkeys 还很年轻，尚未经过第三方审计。请先用小额试用，并在依赖它之前演练一次恢复。'
				]
			},
			{
				title: '许可',
				paragraphs: [
					'Airkeys 的源代码以 MIT 许可证发布，代码本身受该许可证约束；你可以按该许可证编译、使用和修改它。',
					'从 Google Play 或 App Store 购买的手机 App，按本条款和商店自身的条款授权你个人使用。“Airkeys”名称及其标志代表官方版本；请勿以让人误以为你的版本是官方版本的方式使用它们。'
				]
			},
			{
				title: '购买',
				paragraphs: [
					`手机 App 在 Google Play 和 App Store 一次性售价 ${site.price}，商店会按你所在地区的货币显示。付款、退款和收据由商店按其自身条款处理，我们从不接触你的支付信息。Android 和 iPhone 需分别购买。网页助手和从源码编译都是免费的。`
				]
			},
			{
				title: '第三方服务',
				paragraphs: [
					'网页助手通过区块链节点读取余额、广播交易：默认使用公共节点，也可以在“设置”中换成你自己的节点。它还可能获取汇率，以及你选择添加的网络的信息。这些服务由他人运营，适用其各自的条款；我们无法控制它们，也不保证其可用或准确。',
					'区块链、代币及其网络也不归我们所有。它们的手续费、延迟、分叉和故障不在我们的控制范围内。'
				]
			},
			{
				title: '合理使用',
				paragraphs: [
					'请仅在你所在地法律允许的范围内使用 Airkeys，包括有关制裁、税务和资金转移的法律。不得用它损害他人，或干扰它所依赖的服务。'
				]
			},
			{
				title: '不构成建议',
				paragraphs: [
					'Airkeys 及本网站的任何内容都不构成财务、投资、税务或法律建议。网页助手显示的价格和总额只是估算，可能有误。'
				]
			},
			{
				title: '不提供担保',
				paragraphs: [
					'Airkeys 按“现状”和“现有”提供，不附带任何明示或默示的担保，包括适销性、特定用途适用性和不侵权。我们不保证它没有错误、始终可用或满足你的需求。'
				]
			},
			{
				title: '责任限制',
				paragraphs: [
					'在法律允许的最大范围内，对于因你使用或无法使用 Airkeys 而产生的任何间接、附带、特殊或后果性损失，或资产、密钥、数据或利润的损失，包括你所签署转账中的错误以及第三方服务的行为，我们不承担责任。法律不允许此类免责时，我们的全部责任以你为 App 支付的金额为限。',
					'本条款不限制消费者保护法赋予你且不可放弃的权利。'
				]
			},
			{
				title: '如果 Airkeys 不在了',
				paragraphs: [
					'你的资产从不依赖我们：它们就是你的助记词加上两条公开的派生路径。源码仓库里的恢复指南写明了怎样不用 Airkeys、用 Bitcoin Core 和 Foundry 找回每个账户。请保留一份源码和你所用 App 的副本。'
				]
			},
			{
				title: '变更',
				paragraphs: [
					'我们可能更新本条款，例如在 Airkeys 发生变化时。页首日期表示最后一次修改的时间。变更后继续使用 Airkeys，即表示你接受新的条款。'
				]
			}
		]
	},
	privacy: {
		title: '隐私政策',
		description: 'Airkeys 收集什么：手机 App 和网页助手不收集任何关于你的信息；网站统计访问量。',
		updated: '最后更新：2026 年 10 月 27 日',
		intro: `Airkeys 由 ${site.company}（下称“我们”）开发，设计原则是尽可能少知道。手机 App 和网页助手没有账户体系，也没有任何统计分析、广告或追踪，我们从不接收你的助记词、密钥或地址。本网站会统计访问量。本政策说明 Airkeys 的每个部分会处理什么，以及这些信息去往何处。`,
		sections: [
			{
				title: '手机 App',
				paragraphs: [
					'手机 App 只在所有无线模块关闭时工作，不向任何地方发送任何内容：Android 版甚至没有联网权限。助记词和密码短语在钱包打开期间只保存在手机内存中，关闭时即被清除；不会写入手机存储，也不会进入备份。',
					'摄像头在手机本地读取动态码（网页助手的，或 SeedQR）。图像不会保存，也从不离开手机。在 iPhone 上，Airkeys 申请蓝牙权限只是为了确认蓝牙已关闭，从不使用蓝牙。',
					'手机显示的动态码只包含地址和已签名的交易，从不包含密钥。显示哪些账户由你选择。'
				]
			},
			{
				title: '网页助手',
				paragraphs: [
					'网页助手在你的浏览器里运行。它把手机分享的地址和你的设置保存在浏览器的本地存储中，只在你的电脑上，直到你删除为止。它不设置 Cookie，也不加载任何统计分析或第三方脚本。浏览器中的摄像头用于读取手机的动态码，图像不会上传或保存。',
					'为了显示余额和发送交易，你的浏览器会直接连接区块链节点：默认是 Airkeys 列出的公共服务（如 mempool.space、blockstream.info 和 publicnode.com），也可以是你在“设置”中指定的节点。这些服务能看到你的 IP 地址和所查询的地址，并能推断出一起查询的地址属于同一个人。使用自己的节点可以避免这一点。',
					'为了以美元以外的货币显示金额，网页助手会从 Vela 的汇率服务获取汇率；添加网络或代币时，会从 ethereum-data.getvela.app 获取它们的信息，代币和网络的图标也来自这个网站。这些请求都不包含任何地址。代币的美元价格来自 Chainlink 喂价，通过同样的区块链节点读取。'
				]
			},
			{
				title: '本网站',
				paragraphs: [
					'提供 airkeys.app 网站文件的服务器可能会为安全和运维目的，在有限时间内保留标准的技术日志，如 IP 地址、时间和所请求的页面。',
					'落地页和本文档用开源统计工具 Rybbit 统计访问量，服务托管在 tj.appsdata.org。它记录你浏览的页面及其网址参数、从哪个页面来、你点开的外部链接、浏览器、语言、屏幕尺寸和大致位置（根据 IP 地址推断），并在浏览器的本地存储里保存一个随机的访客 ID。它不使用 Cookie。网页助手（airkeys.app/app/）和浏览器扩展不加载它。'
				]
			},
			{
				title: '应用商店与支付',
				paragraphs: [
					'如果你购买手机 App，付款和你的账户由 Google Play 或 App Store 按其各自的隐私政策处理。商店会向我们提供所有开发者都会收到的销售报告，其中可能包含你所在的国家或地区以及订单信息，但从不包含你的支付信息，也不包含任何与你的钱包有关的内容。'
				]
			},
			{
				title: '我们不做的事',
				paragraphs: [
					'我们不出售或分享个人数据，不建立用户画像，不展示广告，也不跨网站或应用追踪你。除上述访问统计外，我们不收集个人数据；如对访问统计有疑问，请写信给我们。要清除网页助手保存的内容，请在“设置”中使用“忘记所有账户”，或在浏览器中清除本网站的数据。'
				]
			},
			{
				title: '邮件',
				paragraphs: ['你给我们发邮件时，我们只用你的地址和邮件内容来回复，只在沟通需要的期间保留。']
			},
			{
				title: '儿童',
				paragraphs: ['Airkeys 并非面向儿童，也不会有意处理儿童的数据。']
			},
			{
				title: '变更',
				paragraphs: [
					'如果 Airkeys 处理的内容发生变化，我们会更新本政策及页首日期。源代码是公开的，你随时可以核实 App 实际做了什么。'
				]
			}
		]
	}
};
