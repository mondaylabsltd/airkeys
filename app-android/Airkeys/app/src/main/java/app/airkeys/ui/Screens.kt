package app.airkeys.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.key
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.text.TextRange
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import app.airkeys.core.AccountRow
import app.airkeys.core.JsonKind
import app.airkeys.core.JsonPiece
import app.airkeys.core.Action
import app.airkeys.core.CodeFrame
import app.airkeys.core.WheelPage
import app.airkeys.core.PhraseInput
import app.airkeys.core.RadioKind
import app.airkeys.core.RadioState
import app.airkeys.core.ReviewView
import app.airkeys.core.Screen
import app.airkeys.core.ViewModel
import app.airkeys.core.WordState
import kotlinx.coroutines.delay

/** Draws the core's view; every tap becomes an action for the core. */
@Composable
fun App(view: ViewModel, act: (Action) -> ViewModel, codeFrame: (Int, Int) -> CodeFrame?, camera: @Composable () -> Unit) {
    CompositionLocalProvider(LocalLanguage provides view.language) { Screens(view, act, codeFrame, camera) }
}

@Composable
private fun Screens(view: ViewModel, act: (Action) -> ViewModel, codeFrame: (Int, Int) -> CodeFrame?, camera: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize().background(Ink.bg)) {
        when (val s = view.screen) {
            is Screen.Offline -> Offline(s)
            is Screen.Welcome -> Welcome(view.version, act)
            is Screen.Import -> Import(s.phrase, act)
            is Screen.Passphrase -> Passphrase(s, act)
            is Screen.Home -> Home(s, act)
            is Screen.Account -> AccountScreen(s.account, act)
            is Screen.Connect -> Page(tr("Connect", "连接"), onBack = { act(Action.Back) }, actions = {
                PrimaryButton(tr("Show code", "显示动态码"), { act(Action.ShowAccounts) }, enabled = s.choices.any { it.selected }, icon = Icons.code)
            }) {
                Text(tr("Show your accounts to the web app", "向网页助手显示你的账户"), style = Type.title)
                Text(
                    tr(
                        "The web app gets addresses only, no public keys. It reads balances and prepares transfers.",
                        "网页助手只得到地址，没有公钥。它查询余额，准备转账。",
                    ),
                    style = Type.dim,
                )
                Card(padding = 6.dp) {
                    for (c in s.scopes) {
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { act(Action.ConnectScope(c.all)) }.padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f).padding(end = 12.dp)) {
                                Text(c.title, style = Type.body.copy(fontWeight = FontWeight.SemiBold))
                                Text(c.detail, style = Type.small)
                            }
                            Radio(c.selected)
                        }
                    }
                }
                Card(padding = 6.dp) {
                    for (c in s.choices) {
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { act(Action.ToggleNetwork(c.network)) }.padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            NetworkBadge(c.network, 36.dp)
                            Text(c.name, style = Type.body, modifier = Modifier.weight(1f).padding(start = 14.dp))
                            Check(c.selected)
                        }
                    }
                }
            }
            is Screen.Code -> {
                // the code fills the screen from the title to the button; its message is a tap away
                var reading by remember(s.json) { mutableStateOf(false) }
                Page(s.title, onBack = { act(Action.Back) }, scroll = false, trailing = {
                    Text(
                        if (reading) tr("Code", "动态码") else tr("Message", "消息"),
                        style = Type.body.copy(color = Ink.lamp, fontWeight = FontWeight.SemiBold),
                        modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable { reading = !reading }.padding(horizontal = 12.dp, vertical = 10.dp),
                    )
                }, actions = { PrimaryButton(tr("Done", "完成"), { act(Action.Done) }) }) {
                    if (reading) {
                        Text(tr("What the code says", "动态码的内容"), style = Type.heading)
                        // a line at a time, drawn as it scrolls into view: a page of 100 accounts is
                        // about a thousand lines, too many to lay out at once
                        val shape = RoundedCornerShape(16.dp)
                        LazyColumn(
                            Modifier.weight(1f).fillMaxWidth().clip(shape).background(Ink.surface).border(1.dp, Ink.stroke, shape),
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(3.dp),
                        ) {
                            items(s.message) { line ->
                                Text(
                                    highlighted(line.pieces),
                                    style = Type.mono.copy(fontSize = 12.5.sp, lineHeight = 17.sp),
                                    modifier = Modifier.padding(start = (line.depth.toInt() * 15).dp), // two characters a level
                                )
                            }
                        }
                    } else {
                        CodeView(codeFrame, Modifier.weight(1f))
                        Text(s.caption, style = Type.dim, maxLines = 2)
                    }
                }
            }
            is Screen.Scan -> Page(s.title, onBack = { act(Action.Back) }, scroll = false, actions = {
                if (s.problem != null) PrimaryButton(tr("Try again", "重试"), { act(Action.Scan) }, icon = Icons.scan)
            }) {
                Box(Modifier.fillMaxWidth().aspectRatio(0.8f).clip(RoundedCornerShape(20.dp)).background(Color(0xFF05060A))) {
                    if (s.problem == null) camera()
                    Viewfinder()
                }
                val p = s.progress
                when {
                    s.problem != null -> Notice(s.problem!!, Ink.danger)
                    p != null && p.needed > 0u -> {
                        Text(tr("Receiving…", "正在接收…"), style = Type.heading)
                        LinearProgressIndicator(
                            progress = { (p.received.toFloat() / p.needed.toFloat()).coerceIn(0f, 1f) },
                            modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                            color = Ink.lamp,
                            trackColor = Ink.raised,
                        )
                    }
                    else -> Text(s.hint, style = Type.dim)
                }
            }
            is Screen.Review -> Review(s.review, act)
            is Screen.Refused -> Page(onBack = { act(Action.Back) }, actions = { SecondaryButton(tr("Back", "返回"), { act(Action.Done) }) }) {
                Center {
                    Icon(Icons.warning, null, tint = Ink.danger, modifier = Modifier.size(52.dp))
                    CenteredText(s.title, Type.title.copy(fontSize = 24.sp))
                }
                Card { Text(s.message, style = Type.body) }
            }
        }
        Banner(view, act)
    }
}

@Composable
private fun Banner(view: ViewModel, act: (Action) -> ViewModel) {
    val toast = view.toast
    LaunchedEffect(toast) {
        if (toast != null) {
            delay(5000)
            act(Action.DismissToast)
        }
    }

    Column(Modifier.fillMaxSize().navigationBarsPadding().padding(16.dp), verticalArrangement = Arrangement.Bottom) {
        AnimatedVisibility(toast != null, enter = fadeIn(), exit = fadeOut()) {
            Row(
                Modifier.fillMaxWidth().padding(bottom = 76.dp).clip(RoundedCornerShape(14.dp)).background(Ink.raised).border(1.dp, Ink.stroke, RoundedCornerShape(14.dp))
                    .clickable { act(Action.DismissToast) }.padding(16.dp),
            ) { Text(toast ?: "", style = Type.body.copy(fontSize = 15.sp)) }
        }
    }
}

@Composable
private fun Offline(s: Screen.Offline) {
    Page {
        Spacer(Modifier.height(24.dp))
        Box(Modifier.size(64.dp).clip(RoundedCornerShape(20.dp)).background(Ink.warn.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
            Icon(Icons.airplane, null, tint = Ink.warn, modifier = Modifier.size(32.dp))
        }
        Text(tr("Take this phone offline", "让这部手机断网"), style = Type.title)
        Text(
            tr(
                "Airkeys works only with every radio off. Turn on Airplane mode, then check that Wi-Fi and Bluetooth are off too.",
                "Airkeys 只在所有无线都关闭时工作。请打开飞行模式，再确认 Wi-Fi 和蓝牙也已关闭。",
            ),
            style = Type.dim,
        )
        val context = LocalContext.current
        Card(padding = 6.dp) {
            for (r in s.radios) {
                Column(Modifier.fillMaxWidth().padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(r.name, style = Type.body, modifier = Modifier.weight(1f))
                        when (r.state) {
                            RadioState.OFF -> Pill(tr("Off", "已关闭"), Ink.safe, Icons.check)
                            RadioState.ON -> Pill(tr("On", "已打开"), Ink.warn, Icons.warning)
                            RadioState.ACTIVE -> Pill(tr("Still active", "仍在工作"), Ink.warn, Icons.warning)
                            RadioState.UNKNOWN -> Pill(tr("Unknown", "未知"), Ink.dim)
                        }
                    }
                    r.detail?.let { Text(it, style = Type.small, modifier = Modifier.padding(top = 4.dp, end = 4.dp)) }
                    if (r.state == RadioState.ON || r.state == RadioState.ACTIVE) {
                        Text(
                            tr("Open settings", "打开设置"),
                            style = Type.small.copy(color = Ink.lamp, fontWeight = FontWeight.SemiBold),
                            modifier = Modifier.padding(top = 6.dp).clip(RoundedCornerShape(8.dp))
                                .clickable { openRadioSettings(context, r.kind, r.state) }.padding(vertical = 4.dp),
                        )
                    }
                }
            }
        }
        if (s.walletOpen) {
            Notice(tr("Your wallet is still open. Airkeys continues once the phone is offline.", "钱包仍然打开着。手机断网后，Airkeys 会继续。"), Ink.dim, Icons.lock)
        }
    }
}

/**
 * The system screen that turns a radio off. A radio that is "still active" while switched off
 * is scanning for Location: its switch is under Location's scanning settings. Phones that lack
 * a screen get the next best one.
 */
private fun openRadioSettings(context: Context, kind: RadioKind, state: RadioState) {
    val scanning = listOf("android.settings.LOCATION_SCANNING_SETTINGS", Settings.ACTION_LOCATION_SOURCE_SETTINGS)
    val active = state == RadioState.ACTIVE
    val tries = when (kind) {
        RadioKind.WIFI -> if (active) listOf("android.settings.WIFI_SCANNING_SETTINGS") + scanning else listOf(Settings.ACTION_WIFI_SETTINGS)
        RadioKind.BLUETOOTH -> if (active) listOf("android.settings.BLUETOOTH_SCANNING_SETTINGS") + scanning else listOf(Settings.ACTION_BLUETOOTH_SETTINGS)
        RadioKind.MOBILE_DATA -> listOf(Settings.ACTION_AIRPLANE_MODE_SETTINGS)
        RadioKind.NETWORK -> listOf(Settings.ACTION_WIRELESS_SETTINGS)
    } + Settings.ACTION_SETTINGS
    for (action in tries) {
        if (runCatching { context.startActivity(Intent(action)) }.isSuccess) return
    }
}

@Composable
private fun Welcome(version: String, act: (Action) -> ViewModel) {
    Page(actions = {
        PrimaryButton(tr("Enter recovery phrase", "输入助记词"), { act(Action.Begin) })
        SecondaryButton(tr("Scan SeedQR", "扫描 SeedQR"), { act(Action.Scan) }, icon = Icons.scan)
    }) {
        Spacer(Modifier.height(24.dp))
        Mark(76.dp)
        Text("Airkeys", style = Type.title.copy(fontSize = 38.sp, lineHeight = 44.sp))
        Text(
            tr("A cold wallet for a phone that stays offline.", "装在离线手机上的冷钱包。"),
            style = Type.dim.copy(fontSize = 16.sp, lineHeight = 23.sp),
        )
        Spacer(Modifier.height(8.dp))
        Feature(
            Icons.lock,
            tr("Nothing is stored", "不存储"),
            tr(
                "Bring your recovery phrase each time. It stays in memory until you close the wallet or the app.",
                "每次使用时输入助记词。它只在内存中，直到你关闭钱包或 App。",
            ),
        )
        Feature(
            Icons.shield,
            tr("Addresses only", "只给地址"),
            tr(
                "The web app gets addresses, never public keys. Until an account sends, its key stays unknown.",
                "网页助手只得到地址，从不得到公钥。账户转出之前，它的公钥无人知晓。",
            ),
        )
        Feature(
            Icons.eye,
            tr("Clear signing", "明文签名"),
            tr(
                "Airkeys signs transfers only, after showing every recipient, amount and fee.",
                "Airkeys 只签转账，并先显示每个收款方、金额和手续费。",
            ),
        )
        Text(version, style = Type.small.copy(color = Ink.faint))
    }
}

@Composable
private fun Feature(icon: ImageVector, title: String, text: String) {
    Row(verticalAlignment = Alignment.Top) {
        Box(Modifier.size(38.dp).clip(RoundedCornerShape(11.dp)).background(Ink.lamp.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = Ink.lamp, modifier = Modifier.size(20.dp))
        }
        Column(Modifier.padding(start = 14.dp)) {
            Text(title, style = Type.body.copy(fontWeight = FontWeight.SemiBold))
            Text(text, style = Type.small.copy(fontSize = 14.sp, lineHeight = 19.sp))
        }
    }
}

@Composable
private fun Import(p: PhraseInput, act: (Action) -> ViewModel) {
    val focus = remember { FocusRequester() }
    // a word tapped in the grid is selected in the field: typing replaces it
    var select by remember { mutableStateOf<Selection?>(null) }
    val spans = Regex("\\S+").findAll(p.text).map { TextRange(it.range.first, it.range.last + 1) }.toList()
    LaunchedEffect(Unit) { focus.requestFocus() }
    Page(tr("Recovery phrase", "助记词"), onBack = { act(Action.Back) }, trailing = {
        IconAction(Icons.scan, tr("Scan SeedQR", "扫描 SeedQR"), { act(Action.Scan) }, Ink.dim)
    }, actions = {
        PrimaryButton(tr("Continue", "继续"), { act(Action.PhraseDone) }, enabled = p.canContinue)
    }) {
        Text(tr("Enter your recovery phrase", "输入你的助记词"), style = Type.title)
        Text(tr("Type the first letters of each word and a space: Airkeys completes it.", "每个词输入前几个字母和一个空格，Airkeys 会补全。"), style = Type.dim)
        Field(
            p.text, {}, "abandon ability …", Modifier.focusRequester(focus), singleLine = false, minLines = 3, error = p.problem != null,
            rewrite = { t -> (act(Action.PhraseInput(t)).screen as? Screen.Import)?.phrase?.text ?: t },
            select = select,
        )
        Suggestions(p.suggestions) { act(Action.Suggestion(it)) }
        p.problem?.let { Text(it, style = Type.small.copy(color = Ink.danger)) }
        if (p.words.isNotEmpty()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Label(tr("${p.words.size} words", "${p.words.size} 个词"))
                Spacer(Modifier.weight(1f))
                if (p.valid) Pill(tr("Valid phrase", "助记词有效"), Ink.safe, Icons.check)
            }
            // as on a recovery card: even columns, numbers aligned
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for (row in p.words.indices.chunked(3)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (k in 0 until 3) {
                            val i = row.getOrNull(k)
                            if (i == null) {
                                Spacer(Modifier.weight(1f))
                                continue
                            }
                            val w = p.words[i]
                            val shape = RoundedCornerShape(10.dp)
                            val chip = when (w.state) {
                                WordState.KNOWN -> Modifier.background(Ink.raised, shape)
                                WordState.TYPING -> Modifier.border(1.dp, Ink.stroke, shape)
                                WordState.UNKNOWN -> Modifier.background(Ink.danger.copy(alpha = 0.12f), shape)
                            }
                            Row(
                                Modifier.weight(1f).clip(shape).then(chip)
                                    .clickable { spans.getOrNull(i)?.let { select = Selection(it) } }
                                    .padding(horizontal = 8.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text("${i + 1}", style = Type.mono.copy(fontSize = 12.sp, color = Ink.faint, textAlign = TextAlign.End), modifier = Modifier.width(18.dp))
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    w.word,
                                    style = Type.mono.copy(fontSize = 15.sp, color = when (w.state) {
                                        WordState.KNOWN -> Ink.text
                                        WordState.TYPING -> Ink.dim
                                        WordState.UNKNOWN -> Ink.danger
                                    }),
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Passphrase(s: Screen.Passphrase, act: (Action) -> ViewModel) {
    Page(tr("Passphrase", "密码短语"), onBack = { act(Action.Back) }, actions = {
        PrimaryButton(tr("Open wallet", "打开钱包"), { act(Action.Open) }, enabled = s.problem == null)
    }) {
        Text(tr("Passphrase", "密码短语"), style = Type.title)
        Text(tr("Leave this empty unless your wallet has one.", "如果钱包没有密码短语，这里留空。"), style = Type.dim)
        Field(s.passphrase, { act(Action.PassphraseInput(it)) }, tr("No passphrase", "无密码短语"), secret = true, error = s.problem != null)
        s.problem?.let { Text(it, style = Type.small.copy(color = Ink.danger)) }
        Notice(
            tr(
                "Each passphrase opens a different wallet from the same words, so a mistyped one opens the wrong wallet without an error. Check the addresses.",
                "同一组助记词配不同的密码短语，打开的是不同的钱包。输错了不会报错，只会打开另一个钱包。请核对地址。",
            ),
            Ink.dim,
            Icons.lock,
        )
    }
}

@Composable
private fun Home(s: Screen.Home, act: (Action) -> ViewModel) {
    Page(
        trailing = {
            Row(
                Modifier.clip(RoundedCornerShape(50)).clickable { act(Action.Close) }.padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.lock, null, tint = Ink.dim, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text(tr("Close wallet", "关闭钱包"), style = Type.small.copy(color = Ink.dim))
            }
        },
        actions = {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SecondaryButton(tr("Connect", "连接"), { act(Action.Connect) }, Modifier.weight(1f), icon = Icons.code)
                PrimaryButton(tr("Scan request", "扫描请求"), { act(Action.Scan) }, Modifier.weight(1.4f), icon = Icons.scan)
            }
        },
    ) {
        // a hundred numbers at a time: the wheel's page, turned below it
        val first = s.page.first.toInt()
        key(first) {
            NumberWheel(
                s.index.toInt() - first,
                (s.page.last - s.page.first).toInt() + 1,
                { act(Action.Account((first + it).toUInt())) },
                unit = tr("Account", "账户"),
                first = first,
            )
        }
        PageTurner(s.page, act)
        for (a in s.accounts) AccountCard(a) { act(Action.OpenAccount(a.network)) }
    }
}

/** "‹ #100 – #199 ›": the wheel's page, and the pages either side of it. */
@Composable
private fun PageTurner(page: WheelPage, act: (Action) -> ViewModel) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        val dim = { on: Boolean -> if (on) Ink.text else Ink.faint }
        Box(Modifier.size(44.dp).clip(CircleShape).clickable(enabled = page.previous) { act(Action.Page(false)) }, contentAlignment = Alignment.Center) {
            Icon(Icons.back, tr("Previous 100 accounts", "上一组 100 个账户"), tint = dim(page.previous), modifier = Modifier.size(20.dp))
        }
        Text(page.label, style = Type.small.copy(color = Ink.dim, fontFeatureSettings = "tnum"), modifier = Modifier.widthIn(min = 120.dp), textAlign = TextAlign.Center)
        Box(Modifier.size(44.dp).clip(CircleShape).clickable(enabled = page.next) { act(Action.Page(true)) }, contentAlignment = Alignment.Center) {
            Icon(Icons.forward, tr("Next 100 accounts", "下一组 100 个账户"), tint = dim(page.next), modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun AccountCard(a: AccountRow, onClick: () -> Unit) {
    Card(Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            NetworkBadge(a.network)
            Column(Modifier.weight(1f).padding(start = 14.dp)) {
                Text(a.name, style = Type.body.copy(fontWeight = FontWeight.SemiBold))
                Text(a.assets, style = Type.small, maxLines = 1)
            }
        }
        Text(short(a.address, 8), style = Type.mono.copy(fontSize = 14.sp, color = Ink.dim))
    }
}

@Composable
private fun AccountScreen(a: AccountRow, act: (Action) -> ViewModel) {
    Page(a.name, onBack = { act(Action.Back) }, actions = {
        PrimaryButton(tr("Show to the web app", "显示给网页助手"), { act(Action.ShareAccount(a.network)) }, icon = Icons.code)
    }) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            NetworkBadge(a.network, 52.dp)
            Column(Modifier.padding(start = 14.dp).weight(1f)) {
                Text(tr("Account #${a.index}", "账户 #${a.index}"), style = Type.heading)
                Text(a.assets, style = Type.small)
            }
        }
        Card {
            Label(tr("Address", "地址"))
            Address(a.address, style = Type.mono.copy(fontSize = 19.sp, lineHeight = 30.sp))
        }
        Card {
            Label(tr("Derivation path", "派生路径"))
            Text(a.path, style = Type.mono)
            Text(tr("Every step is hardened.", "每一级都是硬化派生。"), style = Type.small)
        }
        Notice(
            tr(
                "Its public key stays on this phone until the account first sends. Receiving does not reveal it.",
                "账户第一次转出之前，它的公钥只在这部手机上。收款不会暴露公钥。",
            ),
            Ink.safe,
            Icons.shield,
        )
    }
}

@Composable
private fun Radio(on: Boolean) {
    Box(
        Modifier.size(24.dp).clip(CircleShape).border(2.dp, if (on) Ink.lamp else Ink.stroke, CircleShape),
        contentAlignment = Alignment.Center,
    ) { if (on) Box(Modifier.size(12.dp).clip(CircleShape).background(Ink.lamp)) }
}

@Composable
private fun Check(on: Boolean) {
    Box(
        Modifier.size(26.dp).clip(RoundedCornerShape(8.dp)).background(if (on) Ink.lamp else Ink.raised).border(1.dp, if (on) Ink.lamp else Ink.stroke, RoundedCornerShape(8.dp)),
        contentAlignment = Alignment.Center,
    ) { if (on) Icon(Icons.check, null, tint = Ink.onLamp, modifier = Modifier.size(18.dp)) }
}

/** A line of the message, coloured by kind. */
private fun highlighted(pieces: List<JsonPiece>) = buildAnnotatedString {
    for (p in pieces) {
        val color = when (p.kind) {
            JsonKind.KEY -> Ink.jsonKey
            JsonKind.TEXT -> Ink.jsonText
            JsonKind.NUMBER -> Ink.jsonNumber
            JsonKind.LITERAL -> Ink.jsonLiteral
            JsonKind.PUNCTUATION -> Ink.faint
        }
        withStyle(SpanStyle(color = color)) { append(p.text) }
    }
}

@Composable
private fun Viewfinder() {
    androidx.compose.foundation.Canvas(Modifier.fillMaxSize().padding(28.dp)) {
        val l = size.minDimension * 0.12f
        val w = 3.dp.toPx()
        val c = Ink.lamp
        val (x0, y0, x1, y1) = listOf(0f, 0f, size.width, size.height)
        for ((x, y, dx, dy) in listOf(listOf(x0, y0, 1f, 1f), listOf(x1, y0, -1f, 1f), listOf(x0, y1, 1f, -1f), listOf(x1, y1, -1f, -1f))) {
            drawLine(c, androidx.compose.ui.geometry.Offset(x, y), androidx.compose.ui.geometry.Offset(x + dx * l, y), w, androidx.compose.ui.graphics.StrokeCap.Round)
            drawLine(c, androidx.compose.ui.geometry.Offset(x, y), androidx.compose.ui.geometry.Offset(x, y + dy * l), w, androidx.compose.ui.graphics.StrokeCap.Round)
        }
    }
}

@Composable
private fun Review(r: ReviewView, act: (Action) -> ViewModel) {
    var details by remember { mutableStateOf(false) }
    val lang = LocalLanguage.current
    Page(tr("Review", "核对"), onBack = { act(Action.Reject) }, actions = {
        HoldButton(r.holdLabel, { act(Action.Sign) }, warn = r.warnings.isNotEmpty())
        SecondaryButton(tr("Reject", "拒绝"), { act(Action.Reject) })
    }) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            NetworkBadge(r.network, 44.dp)
            Column(Modifier.padding(start = 14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(r.chain, style = Type.heading)
                    // test coins have no value: never mistake one network for the other
                    if (r.testnet) Spacer(Modifier.width(10.dp))
                    if (r.testnet) Pill(tr("Testnet", "测试网"), Ink.warn)
                }
                Text(tr("From account #${r.fromIndex}", "从账户 #${r.fromIndex}") + " · ${short(r.fromAddress)}", style = Type.small)
            }
        }
        for (w in r.warnings) Notice(w, Ink.warn)
        for (t in r.transfers) {
            Card(border = if (!t.verified) Ink.warn.copy(alpha = 0.5f) else Ink.stroke) {
                t.label?.let { Text(it, style = Type.small.copy(color = Ink.faint)) }
                Text("${t.amount} ${t.asset}", style = Type.amount)
                t.token?.let {
                    if (t.verified) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.check, null, tint = Ink.safe, modifier = Modifier.size(14.dp))
                            Text(tr("Listed token", "已列入代币") + " · ${short(it, 6)}", style = Type.small, modifier = Modifier.padding(start = 6.dp))
                        }
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Pill(tr("Unlisted token", "未列入代币"), Ink.warn, Icons.warning)
                            Text(short(it, 6), style = Type.mono.copy(fontSize = 13.sp, color = Ink.dim), modifier = Modifier.padding(start = 10.dp))
                        }
                    }
                }
                Spacer(Modifier.height(2.dp))
                val own = t.ownIndex
                if (own != null) {
                    // the phone derived its own account's address: named, the address only to glance at
                    Text(
                        buildAnnotatedString {
                            withStyle(SpanStyle(color = Ink.dim)) { append(tr(lang, "to ", "转到")) }
                            withStyle(SpanStyle(color = Ink.text, fontWeight = FontWeight.SemiBold)) { append(tr(lang, "Your account #$own", "你的账户 #$own")) }
                        },
                        style = Type.body,
                    )
                    Text(short(t.to, 4), style = Type.mono.copy(fontSize = 13.sp, color = Ink.dim))
                } else {
                    Text(tr("to", "转到"), style = Type.small)
                    Address(t.to, style = Type.mono.copy(fontSize = 16.sp, lineHeight = 25.sp))
                }
                t.note?.let { Text(it, style = Type.small) }
            }
        }
        Row(Modifier.padding(horizontal = 4.dp)) {
            Text(tr("Network fee, at most", "手续费上限"), style = Type.dim, modifier = Modifier.weight(1f))
            Text(r.fee, style = Type.body.copy(fontWeight = FontWeight.SemiBold))
        }
        for (n in r.notices) Notice(n, Ink.dim, Icons.open)
        Card(Modifier.clickable { details = !details }) {
            Row {
                Text(tr("Details", "详情"), style = Type.body.copy(fontWeight = FontWeight.SemiBold), modifier = Modifier.weight(1f))
                Text(if (details) tr("Hide", "隐藏") else tr("Show", "显示"), style = Type.small.copy(color = Ink.lamp))
            }
            if (details) {
                for (d in r.details) {
                    Row {
                        Text(d.label, style = Type.small, modifier = Modifier.weight(1f))
                        Text(d.value, style = Type.small.copy(color = Ink.text))
                    }
                }
                Text(tr("From", "付款地址"), style = Type.small)
                Address(r.fromAddress, style = Type.mono.copy(fontSize = 13.sp))
            }
        }
    }
}
