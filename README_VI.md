<div align="center">

<img src="./images/banner.png" alt="Discord Token Login" width="100%" />

# Discord Token Login

**Trình quản lý đa tài khoản và chuyển đổi token cho Discord**  
*Tiện ích mở rộng Chromium (Manifest V3). Mọi thứ chạy cục bộ — không phân tích, không theo dõi, không endpoint bên thứ ba.*

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-5865F2?style=flat-square&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro)
[![AES-256-GCM](https://img.shields.io/badge/AES--256--GCM-5865F2?style=flat-square&logo=lock&logoColor=white)](#-mô-hình-bảo-mật)
[![Zero Telemetry](https://img.shields.io/badge/Zero-Telemetry-57F287?style=flat-square&logo=shield&logoColor=white)](#-mô-hình-bảo-mật)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](tsconfig.json)
[![Build](https://img.shields.io/badge/Build-Passing-57F287?style=flat-square&logo=githubactions&logoColor=white)](#-phát-triển--cổng-chất-lượng)
[![Tests](https://img.shields.io/badge/Tests-134%2F134-57F287?style=flat-square&logo=jest&logoColor=white)](#-phát-triển--cổng-chất-lượng)
[![License: MIT](https://img.shields.io/badge/License-MIT-ED4245?style=flat-square)](LICENSE)

</div>

<p align="center">
  <a href="#-tính-năng">Tính năng</a> •
  <a href="#-ảnh-chụp-màn-hình">Ảnh chụp</a> •
  <a href="#-cài-đặt">Cài đặt</a> •
  <a href="#-mô-hình-bảo-mật">Bảo mật</a> •
  <a href="#-cơ-chế-lấy-token">Cơ chế hoạt động</a> •
  <a href="#-phát-triển--cổng-chất-lượng">Phát triển</a> •
  <a href="#-lịch-sử-star">Lịch sử Star</a>
</p>

---

## 🌐 Ngôn ngữ

<p align="center">
  <a href="./README.md"><img src="https://img.shields.io/badge/README-English-5865F2?style=flat-square&logo=googlechrome&logoColor=white" alt="English" /></a>
  <a href="./README_VI.md"><img src="https://img.shields.io/badge/README-Ti%E1%BA%BFng_Vi%E1%BB%87t-5865F2?style=flat-square" alt="Tiếng Việt" /></a>
  <a href="./README_ZH.md"><img src="https://img.shields.io/badge/README-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-5865F2?style=flat-square" alt="简体中文" /></a>
  <a href="./README_KO.md"><img src="https://img.shields.io/badge/README-%ED%95%9C%EA%B5%AD%EC%96%B4-5865F2?style=flat-square" alt="한국어" /></a>
  <a href="./README_JA.md"><img src="https://img.shields.io/badge/README-%E6%97%A5%E6%9C%AC%E8%AA%9E-5865F2?style=flat-square" alt="日本語" /></a>
</p>

---
## 📸 Ảnh chụp màn hình

<div align="center">

### Popup chính — đăng nhập nhanh, chuyển tài khoản, trạng thái phiên

<img src="./images/popup.png" alt="Popup Discord Token Login" width="820" />

<br />

### Quản lý tài khoản — nhiều hồ sơ, tình trạng token, ghi chú riêng tư

<img src="./images/accounts.png" alt="Trình quản lý tài khoản Discord Token Login" width="820" />

<br />

### Cài đặt — chế độ mã hóa, kho mật khẩu, hành vi lấy token

<img src="./images/settings.png" alt="Cài đặt Discord Token Login" width="820" />

</div>

---

## ✨ Tính năng

| Mảng | Mô tả |
| --- | --- |
| **Đăng nhập nhanh** | Dán token và đăng nhập. Token được kiểm tra trước khi ghi bất cứ đâu. |
| **Lấy token** | Đọc token trực tiếp từ tab Discord đã đăng nhập, không cần copy thủ công. |
| **Quản lý tài khoản** | Lưu nhiều tài khoản, chuyển qua lại, ghi chú cục bộ, và xem token nào còn hoạt động. |
| **Lưu trữ mã hóa** | Mọi token được đóng gói bằng **AES-256-GCM** trước khi tới `chrome.storage.local`. Tùy chọn bảo vệ bằng mật khẩu, khóa được suy ra bằng **PBKDF2-HMAC-SHA256** với 310 000 vòng lặp. |
| **Menu ngữ cảnh** | Chuột phải lên biểu tượng để đăng nhập nhanh, lấy token, mở cài đặt — không cần mở popup. |
| **Badge thanh công cụ** | Hiển thị số tài khoản đang lưu mà không cần mở gì cả. |
| **Giao diện sạch** | Giao diện tối dựng trên bảng màu Discord 2023, bộ icon Tabler được đóng gói lúc build, và hệ thống thiết kế dựa trên thang đo thay vì giá trị rời rạc. |

---

## 📥 Cài đặt

### Từ mã nguồn

```bash
git clone https://github.com/nguyenphanno/Extensions-Discord-Token-Login.git
cd Extensions-Discord-Token-Login
npm install          # một lần
npm run build        # tạo ra dist/
```

### Nạp vào trình duyệt

Trên Chrome, Edge, Brave, Opera hoặc Arc:

1. Mở `chrome://extensions` (hoặc `edge://extensions`, `brave://extensions`)
2. Bật **Developer mode** (Chế độ dành cho nhà phát triển)
3. Bấm **Load unpacked** (Tải tiện ích đã giải nén)
4. Chọn thư mục `dist/`

> **npm có thể hiện cảnh báo `install-scripts`.** npm 11 chặn lifecycle script
> của dependency theo mặc định. esbuild không cần script này — binary nền tảng
> của nó đến qua optional dependency `@esbuild/win32-x64` — nên build vẫn chạy
> bình thường. Bạn có thể bỏ qua cảnh báo này.

### Yêu cầu

| | |
| --- | --- |
| **Trình duyệt** | Chrome / Edge / Brave / Opera / Arc 116+ (Manifest V3) |
| **Node.js** | 20 trở lên (để build và chạy các bộ kiểm thử — tiện ích không cần runtime) |
| **Quyền** | `storage`, `scripting`, `contextMenus`, cùng quyền host tới `https://discord.com/*` — tất cả khai báo trong `src/manifest.json` |

---

## 🔒 Mô hình bảo mật

Nói thẳng, vì công cụ phóng đại quá mức bảo đảm của nó tệ hơn nhiều so với
công cụ thừa nhận giới hạn của mình.

**Được bảo đảm**

- Token ở dạng mã hóa AES-256-GCM. Một IV ngẫu nhiên 96-bit được sinh ra cho
  **mỗi** lần ghi — cặp `(key, nonce)` không bao giờ bị dùng lại.
- Ở chế độ **mật khẩu**, khóa được suy ra từ mật khẩu của bạn và *không bao giờ*
  được ghi xuống đĩa. Nó nằm trong `chrome.storage.session`, bộ nhớ tạm, không
  thể bị content script chạm tới, và bị xóa khi trình duyệt đóng.
- Mật khẩu sai tạo ra cùng lỗi với dữ liệu bị can thiệp, nên kẻ tấn công không
  phân biệt được "sai mật khẩu" với "dữ liệu hỏng".
- Đổi chế độ bảo vệ sẽ mã hóa lại toàn bộ bản ghi, và nếu ghi thất bại thì quay
  lại các bản mã hóa cũ thay vì để lại một kho chỉ mới nửa.

**Không được bảo đảm**

- Ở chế độ **khóa thiết bị** (mặc định), khóa nằm trong `chrome.storage.local`
  cạnh bản mã hóa. Mã hóa bảo vệ định dạng bản ghi, nhưng ai sao chép được
  profile trình duyệt hoặc đọc được storage của tiện ích đều có thể lấy cả khóa
  lẫn dữ liệu mã hóa. Chế độ này **không** bảo vệ khỏi mã đã có quyền truy cập
  vào profile trình duyệt.
- Tiện ích có thể đọc token Discord vì đó chính là mục đích của nó. Hãy đối xử
  với nó như bất kỳ công cụ nào có thể chạm vào thông tin đăng nhập: cài từ nguồn
  bạn tin tưởng.
- Điều khoản dịch vụ của Discord chi phối việc sử dụng token, kể cả token của
  chính bạn.

**Để lại dấu vết?** Trình ghi log làm đỏ mọi thứ có hình dạng token trước khi nó
tới console của service worker, nên bật log chi tiết không thể là thứ làm lộ
thông tin đăng nhập vào `chrome://extensions`.

### Luồng dữ liệu

```
token vào  ──►  kiểm tra cấu trúc  ──►  đóng gói AES-256-GCM  ──►  chrome.storage.local
                                                 ▲
                                                 │
                          khóa thiết bị  ───────┤
                          PBKDF2(mật khẩu) ─────┘   (chế độ mật khẩu:
                                                     khóa chỉ nằm trong
                                                     chrome.storage.session)
```

### Tóm tắt mô hình đe doạ

| Kịch bản | Chế độ khóa thiết bị | Chế độ mật khẩu |
| --- | --- | --- |
| Profile trình duyệt bị đánh cắp | ⚠️ Khóa và bản mã hóa đi cùng nhau | ✅ Chỉ có bản mã hóa trên đĩa |
| Profile đồng bộ / sao lưu | ⚠️ Cả hai bản đều đọc được | ✅ Chỉ bản mã hóa |
| Người ta mở devtools | ⚠️ Nhìn thấy | ✅ Nhìn thấy, nhưng vô dụng nếu không có mật khẩu |
| Mã độc đã chạy với quyền của bạn | ❌ Không phòng thủ được | ❌ Không phòng thủ được |
| Đóng trình duyệt | Khóa vẫn còn | ✅ Khóa bị xóa khỏi bộ nhớ |

---

## 🧠 Cơ chế lấy token

Phiên của tab Discord thuộc sở hữu của trang, nên việc lấy token đi qua
`chrome.scripting.executeScript` với `world: 'MAIN'` — bên trong chính ngữ cảnh
JavaScript của trang. Content script chạy ở thế giới cô lập và không nhìn thấy
cả storage của trang lẫn module của client.

Discord **không** giữ token dưới một storage key cố định. Client đang chạy giữ nó
trong bộ nhớ và chỉ nhân bản vào `localStorage` khi trang đang tải lại, nên
`localStorage.getItem('token')` trả về rỗng trên một phiên vẫn hoạt động tốt.
Vì vậy, việc lấy token thử bốn lớp theo thứ tự và báo rõ lớp nào đã trả lời:

1. **Storage key được tài liệu hoá** — đúng trên bản build cũ, và trên trang vừa
   mới tải xong.
2. **`beforeunload` tổng hợp** — đúng tín hiệu mà client tự dùng để đẩy dữ liệu ra,
   nên client đang chạy sẽ công bố thứ nó giữ. Ở đây không ghi gì cả; tiện ích
   chỉ "reo chuông" cho client.
3. **`getToken()` của chính client** — tiếp cận qua module cache của bundler, bằng
   cách đẩy một chunk no-op đưa callback cho cache. Đây là cách hoạt động với
   tab đã mở hàng giờ. Chỉ module nào *cũng ghi được* token mới được coi là auth
   store; entry của chunk được pop lại, nên trang được giữ nguyên như lúc tìm thấy.
4. **Quét có giới hạn các giá trị trong storage** để tìm chuỗi có hình dạng
   token, giúp một bản build chuyển token sang key mới vẫn đọc được. Một giá trị
   *đúng là* session token được chấp nhận bất kể key tên gì; còn giá trị nằm
   trong một blob lớn hơn thì chỉ được lấy ra từ key có tên nói rõ nó chứa gì.

```
 ┌──────────────────────────────────────────────────────────┐
 │      Trích xuất token từ tab Discord                     │
 └──────────────────────────────────────────────────────────┘
          │
          │  1. storage key được tài liệu hoá
          │  2. beforeunload tổng hợp  → đẩy bộ nhớ ra
          │  3. module cache của bundler → getToken()
          │  4. quét storage có giới hạn → giá trị hình dạng token
          ▼
   các ứng viên được xếp hạng theo nguồn gốc + cấu trúc
          │
          ▼
   Discord /users/@me quyết định ứng viên nào là thật
```

Trang chỉ *đề xuất*. Các module khác trong client đưa ra những chuỗi có đúng
chiều dài và bộ ký tự của token — captcha, analytics id, nonce — và không có gì
cục bộ phân biệt được chúng với một phiên đăng nhập. Vì vậy trang trả về mọi giá
trị khả dĩ, kèm nguồn gốc và cho biết nó có *cấu trúc* token thật không (các
đoạn base64url mà đoạn đầu giải mã ra là một id tài khoản dạng số), và worker
hỏi Discord xem cái nào là thật: các ứng viên được thử theo thứ tự độ tin cậy,
tới một giới hạn nhỏ, và ứng viên đầu tiên Discord chấp nhận là thắng. Một kết quả
sai chỉ tốn một request thay vì làm hỏng cả lần lấy token, và khi không tìm
được gì dùng được thì bây giờ nó nói rõ thay vì hiện một lỗi 401 trần.

### Cơ chế đăng nhập

Đăng nhập là câu chuyện ngược lại, với cùng cái bẫy: client công bố phiên nó giữ
trong bộ nhớ khi trang tải lại, nên một lần ghi storage thuần đơn bị chính lần
tải lại dùng để kích hoạt phiên xóa mất. Vì vậy lần ghi đó

- lưu token đúng cách client lưu — dạng JSON đã trích dấu nháy, đó là thứ
  `getItem` trả về bất cứ khi nào giá trị có mặt;
- gọi `setToken` của chính client khi tìm được, chờ ngắn để module cache lấp đầy
  khi bundle khởi động; và
- đăng ký một listener `beforeunload` dùng-một-lần để khẳng định lại giá trị
  mong muốn. Listener chạy theo thứ tự đăng ký, nên cái của ta chạy sau handler
  của client và thắng. Nó tự gỡ khỏi, nên các lần điều hướng sau không bị ảnh
  hưởng.

Đăng xuất dùng cùng cái chốt đó với ý định ngược lại, và đó là lý do một tab đã
đăng xuất vẫn giữ trạng thái đã đăng xuất sau khi tải lại.

> ⚠️ **Chỉ lấy token của chính bạn.** Token là mật khẩu. Dự án này là công cụ
> mã nguồn mở độc lập, **không liên kết, không được chấp thuận và không chính
> thức gắn với** Discord Inc. Việc sử dụng token — kể cả token của bạn — được điều
> chỉnh bởi Điều khoản Dịch vụ của Discord.

---

## 📁 Cấu trúc dự án

```
src/
├── manifest.json          manifest MV3
├── assets/icons/          PNG sinh ra (16/32/48/128/512)
│
├── core/                  không Chrome API, không DOM — logic thuần
│   ├── constants.ts       mọi giá trị có thể chỉnh trong dự án
│   ├── types.ts           mô hình domain + giao thức message của worker
│   ├── logger.ts          log theo scope, có làm đỏ token
│   └── utils/             encoding, điều khiển luồng async, định dạng
│
├── crypto/                kho bí mật
│   ├── aes-gcm.ts         mã hóa envelope
│   ├── key-derivation.ts  PBKDF2 / khóa thiết bị
│   └── vault.ts           máy trạng thái khóa, tái mã hóa nguyên tử
│
├── platform/              lớp bọc mỏng quanh Chrome API
│   ├── messaging.ts       request/response có kiểu tới worker
│   └── settings.ts        tùy chọn dạng rõ
│
├── services/              logic ứng dụng
│   ├── discord-client.ts  module duy nhất gọi API Discord
│   ├── account-service.ts điều phối
│   ├── session-injector.ts đăng nhập / đăng xuất
│   └── token-extractor.ts  lấy token từ tab đang sống
│
├── background/            service worker
│   ├── index.ts           chỉ nối listener
│   ├── router.ts          request → handler, không bao giờ ném lỗi
│   ├── menu.ts            menu chuột phải
│   └── badge.ts           badge thanh công cụ
│
├── ui/                    dùng chung, không framework
│   ├── icons.ts           bộ icon SVG
│   ├── dom.ts             hàm tiện ích phần tử
│   ├── feedback.ts        toast, sheet, trạng thái bận
│   └── styles/            tokens → base → components
│
├── popup/                 bề mặt popup 380 × 600
└── options/               tab cài đặt đầy đủ
```

Hướng phụ thuộc là một chiều: `ui → platform → services → crypto → core`. Không
gì trong `core/` import Chrome API, và đó là điều giữ cho phần bảo mật quan trọng
kiểm thử được trong cô lập.

---

## 🛠️ Phát triển & cổng chất lượng

```bash
npm install

npm run typecheck      # tsc --noEmit, chế độ strict
npm run lint          # eslint + prettier trên toàn repo
npm run verify:crypto  # chạy thật các đường AES-GCM / PBKDF2 / tái khóa
npm run verify:api     # khẳng định request mà token được gửi đi
npm run verify:signin  # chạy đăng nhập với API trình duyệt giả lập
npm run verify:extract  # chạy capture với các tab Discord giả lập
npm run verify:format  # kiểm tra các hàm định dạng + URL CDN thuần
npm run verify:page    # chạy hàm được chèn vào trang với trang giả lập
npm run verify:docs    # mọi liên kết tương đối trong README đều tồn tại
npm run build          # bundle + sao chép + kiểm tra vào dist/
npm run watch          # build lại tăng dần
npm run icons          # tạo lại bộ PNG
npm run icons:preview  # dựng trang tổng hợp icon vào icon-sheet.html
npm run clean          # xoá dist/
npm run pack           # build rồi đóng gói zip để nộp store
npm run verify         # chạy cả mười cổng theo thứ tự
```

Bản build từ chối xuất ra một `dist/` mà manifest hoặc HTML tham chiếu tới tệp
không tồn tại — một gói hỏng sẽ hỏng build chứ không hỏng Chrome.

| Cổng | Số kiểm tra | Điều nó sinh ra để bắt |
| --- | --- | --- |
| `typecheck` | strict `tsc` | Kiểu, import chết, trôi API |
| `lint` | eslint + prettier | Code thừa, biến toàn cục chưa khai báo, lệch phong cách — các lỗi cơ bản mà `tsc` một mình không thấy |
| `verify:crypto` | 20 | Bản mã hóa che token, không tái dùng IV, mật khẩu sai bị từ chối, khoá hoạt động, tái khóa di chuyển mọi bản ghi mà không mất |
| `verify:api` | 18 | Token đi trong đúng header, không tiền tố, không khoảng trắng; 200/401/429 được phân loại đúng |
| `verify:signin` | 15 | Đăng nhập chờ tài liệu đã commit, lùi qua các frame, tự hồi phục qua 1 lần tải lại, và báo tab thay vì báo token khi thất bại |
| `verify:extract` | 11 | Capture chờ tài liệu đã commit, gọi tên từng chế độ thất bại gặp phải, và chỉ tốn đúng một lần tải lại cho bước hồi phục no-storage |
| `verify:page` | 41 | Bốn lớp lấy token, xếp hạng ứng viên, và chốt unload đè lên handler của client |
| `verify:format` | 23 | URL CDN avatar + trang trí, phân tích danh sách token, giải mã snowflake và mốc thời gian |
| `verify:docs` | 6 | Mọi liên kết tương đối trong năm README đều trỏ tới tệp thật |
| `build` | manifest + HTML | Mọi tệp được tham chiếu đều tồn tại trong `dist/` |

Mỗi bộ kiểm thử tồn tại vì nó đã bắt được một lỗi thật. `verify:crypto` phát hiện
lỗi lần chạy đầu tiên, nơi một profile mới sinh khóa thiết bị nhưng vẫn đọc
metadata trước khi khởi tạo. `verify:api` bắt được tiền tố `Token ` khiến Discord
trả lời `401 Unauthorized` với những token hoàn toàn hợp lệ trong khi mọi cổng
khác vẫn xanh. `verify:page` mô phỏng chính xác mô hình chèn của Chrome — chính
mã nguồn của hàm được đánh giá trong một realm trống — vì lỗi làm cho việc lấy
token hỏng suốt nhiều tháng là một hàm được chèn đã với tới một ràng buộc module
không tồn tại trong trang, bị nuốt bởi `try/catch` của chính nó.

---

## ❓ Câu hỏi thường gặp

**Nó có đánh cắp tài khoản của tôi không?**
Không. Không có máy chủ, không phân tích, và không request nào tới ngoài
`discord.com`. Hãy đọc `src/manifest.json` và `src/services/discord-client.ts` —
chúng ngắn, và toàn bộ mã nguồn có thể kiểm chứng.

**Sao không chỉ đọc `localStorage.getItem('token')`?**
Vì Discord hiện đại giữ token trong bộ nhớ và chỉ nhân bản vào storage khi trang
đang tải lại. Xem [Cơ chế lấy token](#-cơ-chế-lấy-token).

**Tài khoản của tôi báo hết hạn.**
Discord đã vô hiệu phiên đó. Hãy lấy lại token từ một tab vẫn đang đăng nhập và
lưu lại.

**Có dùng được trên Firefox không?**
Chưa được. Tiện ích nhắm tới Chromium MV3 và dùng
`chrome.scripting.executeScript` với `world: 'MAIN'`, điều mà Firefox không hiện
thực tương tự.

**Chế độ mật khẩu bảo vệ tôi khỏi mã độc không?**
Không. Bất cứ thứ gì đã chạy với quyền của bạn đều đọc được bộ nhớ tiến trình.
Nó bảo vệ bản *lưu trữ*, đó mới là rủi ro thực tế trên một máy dùng chung hoặc
đã sao lưu.

---

## 📈 Lịch sử Star

Hãy ủng hộ bằng cách đưa sao cho kho lưu trữ này!

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nguyenphanno/Extensions-Discord-Token-Login&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nguyenphanno/Extensions-Discord-Token-Login&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=nguyenphanno/Extensions-Discord-Token-Login&type=Date" />
  </picture>
</p>

---

## ⚠️ Tuyên bố miễn trừ trách nhiệm

- Dự án này là một công cụ mã nguồn mở độc lập và **không liên kết, không
  liên đới, không được uỷ quyền, không được chấp thuận, cũng không bằng bất kỳ
  cách nào chính thức gắn với** Discord Inc.
- "Discord" và logo Discord là thương hiệu của Discord Inc.
- Hãy sử dụng tiện ích này có trách nhiệm và tuân thủ Điều khoản Dịch vụ của
  Discord. Không bao giờ chia sẻ token đăng nhập của bạn với bên không đáng tin.
- Các tác giả không chịu trách nhiệm về bất kỳ khoản mất tài khoản hay hạn chế
  nào do sử dụng sai.

---

## 📜 Giấy phép

Phân phối theo [MIT License](LICENSE). Được xây dựng với ❤️ bởi
[nguyenphanno](https://github.com/nguyenphanno).

Để build lại tăng dần khi đang chỉnh sửa, dùng `npm run watch`.

