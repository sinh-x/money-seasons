# Khám phá với gia đình mẫu Minh – Lan

**Tất cả tên, số tiền và tình huống dưới đây đều hư cấu**, chỉ để học ứng dụng; không phải dữ liệu hộ gia đình thật, giao dịch đã xảy ra hay lời khuyên tài chính. Mẫu được lưu trong repo tại `public/demo-data.js`; không đọc dữ liệu riêng, gọi mạng hay tự nạp lúc khởi động.

## Trước khi bắt đầu: chỉ dùng bản thử có thể bỏ đi

- Dùng một phiên bản thử **đã được người vận hành cho phép**, với kho dữ liệu và hồ sơ trình duyệt riêng, chỉ chứa dữ liệu tổng hợp. Hướng dẫn này không yêu cầu triển khai, khởi động lại hay nạp mẫu vào dịch vụ đang chạy; không dùng kho của gia đình hoặc các dịch vụ cổng 3080/3081 cho việc thử này.
- **Xuất JSON ↓ trước khi thay mẫu**, giữ tệp ở nơi an toàn nếu muốn giữ kế hoạch hiện tại. Tệp xuất không mã hóa. Mẫu thay **toàn bộ** kế hoạch, không thêm/gộp vào bản cũ; không có hoàn tác tự động hoặc sao lưu tự động.
- Ngày mẫu cố định: kỳ dự báo **11/2026–12/2027**, 14 tháng. Mốc số dư mới nhất là **2026-11-01**, mốc cũ là **2026-10-15**. Chỉ dùng khi ngày kiểm tra từ 2026-11-01 trở đi; không đổi đồng hồ máy hoặc dời ngày mẫu. Sau này mẫu vẫn giữ các ngày này, không trở thành số dư hôm nay.
- Nếu có lỗi/xung đột lưu, dừng chỉnh sửa, xuất bản chưa lưu và dùng quy trình đọc lại/khôi phục hiện có. Không thử ghi đè mù, tự gộp, sửa JSON kho trực tiếp hay chiếm khóa ghi.

## Nạp, hủy và đặt lại mẫu

1. Đăng nhập vào phiên bản thử riêng. Chỉ mở/tải lại ứng dụng **không** tự tạo mẫu hay lưu một kế hoạch mới.
2. Xuất kế hoạch muốn giữ bằng **Xuất JSON ↓**. Nếu có dữ liệu cũ v1/v2, giữ bản gốc trước và dùng quy trình chuyển đổi riêng; bài học này không yêu cầu chuyển đổi dữ liệu thật.
3. Mở **Hướng dẫn** (hộp **Hướng dẫn & khôi phục**) → **Thay bằng mẫu tổng hợp…**. Ở hộp xác nhận, chọn **Hủy** để thử: kế hoạch và phiên bản lưu phải giữ nguyên. Đóng hộp hướng dẫn nếu còn mở.
4. Lặp lại bước 3 và xác nhận thay toàn bộ. Tên kế hoạch là **Gia đình mẫu Minh – Lan**, có 9 đối tượng và 19 khoản thu/chi. Đợi trạng thái **Đã lưu · phiên bản …**, rồi tải lại trang: mẫu vẫn còn.
5. Chỉnh sửa chỉ tác động bản đang nạp, không sửa nguồn mẫu trong repo. Để **đặt lại chính xác**, xuất bài tập nếu muốn giữ rồi lặp lại bước 3 và xác nhận. Mọi sửa đổi, đối tượng/khoản thêm và mốc ước tính đã chỉnh đều bị thay bằng mẫu gốc, không gộp.

## Đơn vị tiền: đồng VND nguyên, không tự nhân hai lần

Mọi số trong bảng dưới đây là **VND nguyên**. `m` = 1.000.000 VND, `k` = 1.000 VND khi đọc ví dụ; JSON lưu số nguyên, không có đơn vị tắt.

Trong ô nhập, số trần được hiểu theo **nghìn**: `5` → 5.000 VND; `5000` → 5.000.000 VND. Để nhập chính xác 1.300.000 đồng, gõ **`1300000 VND`** hoặc `1,3tr`, rồi kiểm tra bản xem trước. `500 VND` là 500 đồng, không phải 500 nghìn. Ô đã lưu mở lại có hậu tố VND để tránh nhân nhầm. Để trống khoản dự kiến là **chưa biết** (`null`), không phải 0; số dư tài khoản bắt buộc có số tiền.

## Bài học qua năm không gian

Các thao tác xem tháng, mở/thu gọn và bật/tắt khoản đang cân nhắc không lưu tài chính, không tăng phiên bản. Nếu chi tiết đang ẩn, chọn **Mở rộng tất cả**. Trên màn hình hẹp dùng **Thẻ tháng** hoặc cuộn ngang bên trong **Bảng chi tiết**.

### 1. Lịch tài chính — tự kiểm tra phép tính

Chọn **Tháng xem** lần lượt 11/2026, 12/2026 và 01/2027; đối chiếu thẻ tổng hợp và bảng/thẻ tháng:

| Tháng | Đầu tháng | Thu dự kiến | Chi đã biết | Cuối tháng đã biết | Độ đầy đủ |
|---|---:|---:|---:|---:|---|
| 11/2026 | 50.000.000 | 43.000.000 | 34.400.000 | 58.600.000 | Đủ các số tiền dự kiến |
| 12/2026 | 58.600.000 | 43.500.000 | 28.400.000 | 73.700.000 | Thiếu đúng 1 khoản chi nha khoa |
| 01/2027 | 73.700.000 | 43.000.000 | 28.700.000 | 88.000.000 | Vẫn thiếu do chuyển tiếp tháng trước |

- Tháng 11: **50m + 43m − 34,4m = 58,6m**. Chi thường kỳ 26,4m + trả nợ 2m + bảo hiểm 6m + hoạt động miễn phí 0 = 34,4m.
- Tháng 12: thu 43m + thu hồi cho mượn 0,5m = 43,5m. **58,6m + 43,5m − 28,4m = 73,7m**, nhưng đây chỉ là phần đã biết: nha khoa Bình chưa biết giá. Không đọc con số này như số dư hoàn chỉnh.
- Tháng 1: điện nước tăng 0,3m, chi đã biết 28,7m; **73,7m + 43m − 28,7m = 88m**. Nhãn thiếu dữ liệu vẫn còn dù tháng 1 không có khoản mới chưa biết.
- Chọn 06/2027: chi mặc định **28.700.000 VND**. Bật **Tính cả khoản đang cân nhắc**: chi thành **36.700.000 VND** vì du lịch 8m. Tắt lại: về 28,7m, không đổi kế hoạch/phiên bản lưu.

Không có mốc tiền mặt mới sau tháng 11 nên số dư dự kiến chuyển tiếp, kể cả qua tháng 1. Khi người dùng thêm mốc mới, ứng dụng dùng cơ sở gộp mới và vẫn áp dụng toàn bộ kế hoạch tháng đó; đây không phải đối soát giao dịch.

### 2. Rõ chi — đối tượng, lịch và ước tính theo thời gian

Mở các đối tượng. Có đúng bốn **Cá nhân**: Minh (chồng · mẫu), Lan (vợ · mẫu), An (con · mẫu), Bình (con · mẫu); một **Nhóm** Gia đình (mẫu); bốn **Danh mục** Nhà ở, Sinh hoạt, Đi lại, Dự phòng. Không có tuổi, tài khoản đăng nhập hay thông tin định danh thật. Mỗi người có khoản chi; loại đối tượng không thay quyền hay phép tính.

Kiểm tra mười khoản chi thường kỳ, đều **hằng tháng 11/2026–12/2027**:

| Đối tượng | Khoản | VND mỗi lần |
|---|---|---:|
| Nhà ở | Tiền thuê nhà | 8.000.000 |
| Sinh hoạt | Thực phẩm | 6.000.000 |
| Sinh hoạt | Điện nước | 1.500.000, từ 01/2027 là 1.800.000 |
| Đi lại | Đi lại hằng tháng | 2.000.000 |
| Minh | Ăn trưa Minh | 1.200.000 |
| Lan | Ăn trưa Lan | 1.200.000 |
| An | Học phí An | 3.000.000 |
| An | Hoạt động An | 600.000 |
| Bình | Mẫu giáo Bình | 2.500.000 |
| Bình | Hoạt động Bình | 400.000 |

Các bài tập lịch/ngoại lệ:

- **Bảo hiểm gia đình**: 6.000.000 VND, hằng năm (12 tháng), neo 11/2026, kết thúc 11/2027. Chỉ có 11/2026 và 11/2027; không có ở 12/2026, 10/2027 hay 12/2027.
- **Đồ dùng học tập An**: 1.200.000 VND một lần 08/2027, không có ở tháng 7 hoặc 9.
- **Điện nước**: mở chi tiết, đổi **Tháng hiệu lực số dự kiến** giữa 11/2026, 12/2026, 01/2027, 12/2027 để thấy 1,5m / 1,5m / 1,8m / 1,8m; đóng bằng **Hủy** nếu chỉ xem. Nguồn giữ số gốc 1.500.000 và đúng một mốc đổi 01/2027 = 1.800.000, không viết lại lịch sử.
- **Nha khoa Bình (chưa biết giá)**: khoản chi được đưa vào kế hoạch, một lần 12/2026, số tiền trống/chưa biết. **Hoạt động miễn phí**: khoản chi được đưa vào kế hoạch, một lần 11/2026, số tiền **0** đã biết. **Du lịch đang cân nhắc**: 8.000.000 VND một lần 06/2027, chỉ được tính khi bật so sánh.
- **Kế hoạch trả nợ** thuộc Gia đình: chi 2.000.000 VND hằng tháng 11/2026–12/2027, là khoản kế hoạch bình thường, không tự sửa dư nợ.

Bài tập sửa và khôi phục: chọn Tháng xem 11/2026, mở **Ăn trưa Minh**, nhập `1300000 VND`, đặt hiệu lực 11/2026, xem trước rồi xác nhận lưu. Xuất JSON, nhập lại tệp đó bằng **Nhập JSON ↑**, xem trước và xác nhận: mọi trường v3 và lịch/mốc giữ nguyên. Sau đó thay lại mẫu có xác nhận: ăn trưa trở về 1.200.000 VND, không còn mốc chỉnh bài tập.

### 3. Đa thu — dùng chung người, không tạo bản sao

Chỉ hai đối tượng có khoản thu xuất hiện: Minh và Lan. Kiểm tra **Thu nhập Minh 25.000.000 VND** và **Thu nhập Lan 18.000.000 VND**, đều được đưa vào kế hoạch, hằng tháng 11/2026–12/2027. Đó là hai khoản còn lại trong tổng 12 khoản thu/chi thường kỳ ban đầu. Không có thu nhập cho An/Bình.

Minh còn có **Kế hoạch thu hồi cho mượn 500.000 VND**, một lần 12/2026. Vì thế tổng thu là 43m tháng 11 và 43,5m tháng 12. Đây là kế hoạch, không chứng minh đã thu tiền hay đã giảm khoản cho mượn. Danh sách Thêm khoản thu dùng chung cả 9 đối tượng; đóng nếu chỉ xem, không cần tạo thêm để làm bài học.

### 4. Tài khoản — lịch sử không phải phép cộng

Chọn 11/2026, mở lịch sử và đối chiếu đúng ba mốc:

| Tài khoản | Ngày cố định | VND |
|---|---|---:|
| Ví mẫu | 2026-10-15 | 2.000.000 |
| Ví mẫu | 2026-11-01 | 3.000.000 |
| Ngân hàng mẫu | 2026-11-01 | 47.000.000 |

Mỗi tài khoản chỉ dùng mốc mới nhất phù hợp tháng xem: **3m + 47m = 50m**, không cộng thêm 2m lịch sử thành 52m. Mốc không phải thu nhập; không tự cập nhật theo ngày hôm nay. Chỉ quan sát trong bài này, không thay ngày/số dư để cố làm mẫu giống dữ liệu thật.

### 5. Công nợ — tách khỏi tiền sẵn có

Chọn lần lượt 11/2026, 12/2026, 01/2027, rồi một tháng muộn hơn. **Khoản vay mẫu** luôn là phải trả **30.000.000 VND**, **Khoản cho mượn mẫu** luôn là phải thu **3.000.000 VND**; cả hai có mốc 2026-11-01. Đây là hai hướng riêng, không bù trừ nhau hay cộng/trừ vào cơ sở tiền mặt 50m.

Khoản trả nợ 2m/tháng và khoản thu hồi 0,5m tháng 12 chỉ thay chi/thu dự kiến trong lịch. Chúng **không tự giảm số dư nợ**, tự tính lãi hay đánh dấu đã thanh toán. Các nút lên kế hoạch trả/thu hồi tạo khoản kế hoạch bình thường, không phải lệnh chuyển tiền. Không cần tạo thêm trong bài học.

## Sau bài học và giới hạn kiểm chứng

Xuất bài tập muốn giữ, hoặc xác nhận thay lại mẫu để bắt đầu từ đầu. Không chép mẫu vào kho thật hay mở dịch vụ công khai. Không có schema, màn hình, quyền đăng nhập hoặc cơ chế lưu mới cho mẫu này; xác nhận, kiểm tra phiên bản và quy trình khôi phục hiện có vẫn áp dụng.

Các kiểm tra tự động ở `test/demo-data.test.mjs`, `test/server.test.mjs`, `test/deployment.test.mjs` và `scripts/browser-check.mjs` kiểm tra giá trị/lịch/bản sao, phục vụ module công khai, không tự nạp/hủy không ghi, lưu có xác nhận, xung đột và bài học trình duyệt trong môi trường tạm riêng. Kết quả triển khai được ghi ngoài repo trong hồ sơ MS-002; kiểm tra tự động không thay thế **review độc lập hoặc 13 kịch bản UAT do người dùng thực hiện**. Không có tuyên bố triển khai dịch vụ hoặc UAT đã được chấp nhận.
