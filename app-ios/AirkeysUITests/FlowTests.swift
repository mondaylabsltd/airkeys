import XCTest

/// The app on a simulator or a phone, driven as a person would: import, show accounts, receive
/// a request (through the debug delivery hook — the simulator has no camera), review, hold to
/// sign. Screenshots go to $SCREENSHOTS when set (on a phone, into the test result), so the
/// codes on screen can be decoded.
final class FlowTests: XCTestCase {
    #if targetEnvironment(simulator)
        static let simulator = true
    #else
        static let simulator = false
    #endif
    /// Screenshots are wanted: into $SCREENSHOTS, or on a phone into the test result.
    static let shooting = !simulator || ProcessInfo.processInfo.environment["SCREENSHOTS"] != nil

    override func setUp() {
        continueAfterFailure = false
    }

    static let phrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    static let request = #"{"airkeys":1,"type":"sign","id":"ios-1","network":"evm","chainId":1,"from":{"index":0,"address":"0xF23521DE6e2B111B384c1308b3c59Acc7Bf5e158"},"txs":[{"to":{"address":"0x000000000000000000000000000000000000dEaD"},"amount":"100000000","token":{"address":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","symbol":"USDC","decimals":6},"nonce":0,"gas":65000,"maxFeePerGas":"30000000000","maxPriorityFeePerGas":"1000000000"},{"to":{"index":1},"amount":"500000000000000000","nonce":1,"gas":21000,"maxFeePerGas":"30000000000","maxPriorityFeePerGas":"30000000000"}]}"#

    /// To $SCREENSHOTS on a simulator; on a phone, into the test result
    /// (`xcrun xcresulttool export attachments`).
    private func shot(_ name: String) {
        let image = XCUIScreen.main.screenshot()
        if let dir = ProcessInfo.processInfo.environment["SCREENSHOTS"] {
            try? image.pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
            return
        }
        #if !targetEnvironment(simulator)
            let attachment = XCTAttachment(screenshot: image)
            attachment.name = name
            attachment.lifetime = .keepAlways
            add(attachment)
        #endif
    }

    func testImportConnectReviewSign() {
        let app = XCUIApplication()
        app.launchEnvironment["AIRKEYS_DELIVER"] = Data(Self.request.utf8).base64EncodedString()
        app.launchEnvironment["AIRKEYS_ASSUME_OFFLINE"] = "1"
        app.launch()

        XCTAssertTrue(app.buttons["Enter recovery phrase"].waitForExistence(timeout: 5))
        shot("i01-welcome")
        app.buttons["Enter recovery phrase"].tap()
        let field = app.textViews["abandon ability …"]
        XCTAssertTrue(field.waitForExistence(timeout: 3))
        field.tap()
        // four letters and a space per word: Airkeys completes the rest
        field.typeText(String(repeating: "aban ", count: 11) + "abou")
        XCTAssertTrue(app.buttons["about"].waitForExistence(timeout: 3), "the last word is suggested")
        XCTAssertEqual(field.value as? String, String(repeating: "abandon ", count: 11) + "abou", "finished words are completed")
        shot("i02-import")
        app.buttons["Continue"].tap()
        XCTAssertTrue(app.staticTexts["Leave this empty unless your wallet has one."].waitForExistence(timeout: 3))
        shot("i03-passphrase")
        app.buttons["Open wallet"].tap()

        XCTAssertTrue(app.staticTexts["Ethereum & EVM"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["0xF23521DE…7Bf5e158"].exists, "account #0 is the known address")
        shot("i04-home")

        // the wheel: account #7, then back to #0
        let wheel = app.pickerWheels.firstMatch
        wheel.adjust(toPickerWheelValue: "7")
        XCTAssertTrue(app.staticTexts["0x1445Be1A…2dD48e19"].waitForExistence(timeout: 3), "the wheel at 7 shows account #7")
        shot("i04-wheel-7")
        wheel.adjust(toPickerWheelValue: "0")
        XCTAssertTrue(app.staticTexts["0xF23521DE…7Bf5e158"].waitForExistence(timeout: 3), "and back at 0, account #0")

        app.buttons["Connect"].tap()
        XCTAssertTrue(app.staticTexts["Accounts #0 to #99"].waitForExistence(timeout: 3), "the Connect screen offers the page of the wheel's account")
        shot("i04-connect")
        app.buttons["Show code"].tap()
        XCTAssertTrue(app.staticTexts["Show this to the web app"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Accounts #0 to #99 · Bitcoin, Ethereum & EVM · addresses only"].exists, "the page of 100 accounts, by default")
        // a page of 100 accounts takes about 10 frames of the code: enough screenshots to read it
        if Self.shooting {
            for n in 0 ..< 24 {
                shot("code-accounts-\(n)")
                Thread.sleep(forTimeInterval: 0.15)
            }
        }
        // the message of 100 accounts: about a thousand lines, drawn as they come into view
        app.buttons["Message"].tap()
        XCTAssertTrue(app.staticTexts["\"airkeys\": 1,"].waitForExistence(timeout: 5), "the JSON, a line at a time")
        shot("i04-message")
        app.buttons["Code"].tap()
        XCTAssertTrue(app.buttons["Message"].waitForExistence(timeout: 5))
        app.buttons["Done"].tap()

        app.buttons["Scan request"].tap()
        XCTAssertTrue(app.staticTexts["100 USDC"].waitForExistence(timeout: 5), "the delivered request is reviewed")
        XCTAssertTrue(app.staticTexts["to Your account #1"].exists)
        shot("i05-review")
        let hold = app.buttons["hold-to-confirm"]
        XCTAssertEqual(hold.label, "Hold to sign 2 transactions")
        hold.press(forDuration: 0.3)
        XCTAssertTrue(app.staticTexts["100 USDC"].exists, "a short press does not sign")
        hold.press(forDuration: 1.6)
        XCTAssertTrue(app.staticTexts["Signed"].waitForExistence(timeout: 3))
        if Self.shooting {
            for n in 0 ..< 8 {
                shot("code-signed-\(n)")
                Thread.sleep(forTimeInterval: 0.15)
            }
        }
        // what the code says: the JSON, laid out
        app.buttons["Message"].tap()
        XCTAssertTrue(app.staticTexts["What the code says"].waitForExistence(timeout: 3))
        shot("i06-message")
        app.buttons["Code"].tap()
        app.buttons["Done"].tap()
        XCTAssertTrue(app.staticTexts["Ethereum & EVM"].waitForExistence(timeout: 3))
        app.buttons["Close wallet"].tap()
        XCTAssertTrue(app.buttons["Enter recovery phrase"].waitForExistence(timeout: 3), "closing forgets the wallet")
    }

    /// The wheel holds a page of 100 accounts; the next page is a tap away, and Connect follows it.
    func testPagesOfAccounts() {
        let app = XCUIApplication()
        app.launchEnvironment["AIRKEYS_ASSUME_OFFLINE"] = "1"
        app.launch()
        app.buttons["Enter recovery phrase"].tap()
        let field = app.textViews["abandon ability …"]
        XCTAssertTrue(field.waitForExistence(timeout: 3))
        field.tap()
        field.typeText(String(repeating: "aban ", count: 11) + "abou")
        app.buttons["Continue"].tap()
        XCTAssertTrue(app.buttons["Open wallet"].waitForExistence(timeout: 3))
        app.buttons["Open wallet"].tap()
        XCTAssertTrue(app.staticTexts["#0 – #99"].waitForExistence(timeout: 5), "the first page")
        XCTAssertFalse(app.buttons["Previous 100 accounts"].isEnabled, "no page before the first")
        app.buttons["Next 100 accounts"].tap()
        XCTAssertTrue(app.staticTexts["#100 – #199"].waitForExistence(timeout: 3), "the next page")
        shot("i07-page-2")
        app.buttons["Connect"].tap()
        XCTAssertTrue(app.staticTexts["Accounts #100 to #199"].waitForExistence(timeout: 3), "Connect offers the wheel's page")
        app.buttons["Back"].tap()
        app.buttons["Previous 100 accounts"].tap()
        XCTAssertTrue(app.staticTexts["#0 – #99"].waitForExistence(timeout: 3))
        app.buttons["Close wallet"].tap()
    }

    /// A mistyped word, fixed by tapping it in the grid and typing it again.
    func testFixAWordFromTheGrid() {
        let app = XCUIApplication()
        app.launchEnvironment["AIRKEYS_ASSUME_OFFLINE"] = "1"
        app.launch()
        app.buttons["Enter recovery phrase"].tap()
        let field = app.textViews["abandon ability …"]
        XCTAssertTrue(field.waitForExistence(timeout: 3))
        field.tap()
        field.typeText(String(repeating: "aban ", count: 7) + "xyzw " + String(repeating: "aban ", count: 3) + "abou ")
        XCTAssertTrue(app.staticTexts["Word 8 is not in the BIP-39 word list."].waitForExistence(timeout: 3))
        app.staticTexts["xyzw"].tap()
        field.typeText("aban ")
        XCTAssertTrue(app.staticTexts["Valid phrase"].waitForExistence(timeout: 3), "the tapped word was replaced and completed")
        XCTAssertEqual(field.value as? String, String(repeating: "abandon ", count: 11) + "about ")
        shot("i06-word-fixed")
    }

    /// A phone in Simplified Chinese: the shell's words and the core's, both in Chinese, through
    /// the same import, code and review as in English.
    func testChinese() {
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(zh-Hans)", "-AppleLocale", "zh_CN"]
        app.launchEnvironment["AIRKEYS_DELIVER"] = Data(Self.request.utf8).base64EncodedString()
        app.launchEnvironment["AIRKEYS_ASSUME_OFFLINE"] = "1"
        app.launch()

        XCTAssertTrue(app.buttons["输入助记词"].waitForExistence(timeout: 5), "the welcome screen in Chinese")
        XCTAssertTrue(app.buttons["扫描 SeedQR"].exists)
        XCTAssertTrue(app.staticTexts["不存储"].exists)
        shot("zh01-welcome")
        app.buttons["输入助记词"].tap()
        XCTAssertTrue(app.staticTexts["输入你的助记词"].waitForExistence(timeout: 3))
        let field = app.textViews["abandon ability …"]
        XCTAssertTrue(field.waitForExistence(timeout: 3))
        field.tap()
        field.typeText(String(repeating: "aban ", count: 11) + "abou")
        XCTAssertTrue(app.buttons["about"].waitForExistence(timeout: 3), "the last word is suggested")
        XCTAssertEqual(field.value as? String, String(repeating: "abandon ", count: 11) + "abou", "finished words are completed")
        XCTAssertTrue(app.staticTexts["12 个词"].exists)
        shot("zh02-import")
        app.buttons["继续"].tap()
        XCTAssertTrue(app.staticTexts["如果钱包没有密码短语，这里留空。"].waitForExistence(timeout: 3))
        app.buttons["打开钱包"].tap()

        // the core's words (the account rows) and the shell's (buttons, the wheel's unit)
        XCTAssertTrue(app.staticTexts["Ethereum 和 EVM"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["ETH、ERC-20 代币"].exists)
        XCTAssertTrue(app.staticTexts["0xF23521DE…7Bf5e158"].exists, "account #0 is the known address")
        XCTAssertTrue(app.staticTexts["账户"].exists)
        XCTAssertTrue(app.buttons["连接"].exists)
        XCTAssertTrue(app.buttons["扫描请求"].exists)
        shot("zh03-home")
        app.buttons["连接"].tap()
        XCTAssertTrue(app.staticTexts["账户 #0 到 #99"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["向网页助手显示你的账户"].exists)
        shot("zh04-connect")
        app.buttons["显示动态码"].tap()
        XCTAssertTrue(app.staticTexts["给网页助手扫描"].waitForExistence(timeout: 3))
        shot("zh05-code")
        app.buttons["完成"].tap()

        app.buttons["扫描请求"].tap()
        XCTAssertTrue(app.staticTexts["100 USDC"].waitForExistence(timeout: 5), "the delivered request is reviewed")
        let hold = app.buttons["hold-to-confirm"]
        XCTAssertEqual(hold.label, "按住签名 2 笔交易")
        shot("zh06-review")
        hold.press(forDuration: 1.6)
        XCTAssertTrue(app.staticTexts["已签名"].waitForExistence(timeout: 3))
        app.buttons["完成"].tap()
        XCTAssertTrue(app.buttons["关闭钱包"].waitForExistence(timeout: 3))
        app.buttons["关闭钱包"].tap()
        XCTAssertTrue(app.buttons["输入助记词"].waitForExistence(timeout: 3), "closing forgets the wallet")
    }

    /// On a real phone: what the app shows first, and the radios it reports (the simulator shares
    /// the Mac's network). Attaches a screenshot and the texts to the test result.
    func testDeviceFirstScreen() throws {
        try XCTSkipIf(Self.simulator, "for a phone: the simulator has the Mac's radios")
        let app = XCUIApplication()
        app.launch()
        let offline = app.staticTexts["Take this phone offline"], welcome = app.buttons["Enter recovery phrase"]
        XCTAssertTrue(offline.waitForExistence(timeout: 5) || welcome.exists, "the first screen: offline, or welcome")
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.lifetime = .keepAlways
        add(screenshot)
        let texts = app.staticTexts.allElementsBoundByIndex.map(\.label)
        let report = XCTAttachment(string: texts.joined(separator: " | "))
        report.lifetime = .keepAlways
        add(report)
        print("AIRKEYS-SCREEN: " + texts.joined(separator: " | "))
    }
}
