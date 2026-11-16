/**
 * ขอตำแหน่งปัจจุบันจากเบราว์เซอร์
 *
 * ใช้ตอนลงทะเบียนกิจกรรมที่ผู้ดูแลตั้งพื้นที่จัดงานไว้
 *
 * แยกออกมาเป็นไฟล์ของตัวเองเพราะ API ของเบราว์เซอร์ยังเป็นแบบ callback
 * และรหัสข้อผิดพลาดที่คืนมาเป็นตัวเลขล้วน ๆ ซึ่งเอาไปแสดงให้ผู้ใช้อ่านไม่ได้
 * ตัวนี้แปลงเป็น Promise และแปลงรหัสเป็นคำอธิบายที่บอกได้ว่าต้องทำอะไรต่อ
 */

/** ข้อผิดพลาดที่รู้สาเหตุแล้ว มี code ไว้ให้หน้าเว็บเลือกข้อความเอง */
export class LocationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LocationError';
    this.code = code;
  }
}

/**
 * getPosition คืน { lat, lng, accuracy } หรือโยน LocationError
 *
 * timeout 15 วินาที เพราะ GPS ในอาคารใช้เวลาหาสัญญาณนานกว่ากลางแจ้งมาก
 * ถ้าตั้งสั้นกว่านี้คนที่ยืนอยู่ในโรงอาหารจะถูกตัดบ่อย
 *
 * maximumAge 0 คือบังคับให้วัดใหม่ทุกครั้ง ไม่เอาค่าที่เบราว์เซอร์จำไว้
 * ไม่งั้นคนที่เพิ่งเดินเข้ามาในงานอาจได้พิกัดเก่าตอนอยู่นอกพื้นที่
 */
export function getPosition() {
  return new Promise((resolve, reject) => {
    /*
      เบราว์เซอร์ปิดการระบุตำแหน่งทั้งหมดเมื่อหน้าเว็บไม่ได้เปิดผ่าน https
      (ยกเว้น localhost ซึ่งนับเป็น secure context อยู่แล้ว)

      ต้องเช็กตรงนี้ก่อน เพราะถ้าปล่อยให้เรียก getCurrentPosition ไปเลย
      Chrome จะคืนรหัส 1 ซึ่งแปลว่า "ผู้ใช้ไม่อนุญาต" ทั้งที่ผู้ใช้ไม่เคยเห็นกล่องขอสิทธิ์
      ผู้ใช้จะไปไล่เปิดสิทธิ์ในตั้งค่าเบราว์เซอร์เท่าไหร่ก็ไม่หาย
      เพราะต้องแก้ที่เครื่อง server ให้เสิร์ฟผ่าน https
    */
    if (!window.isSecureContext) {
      reject(
        new LocationError(
          'insecure',
          'ต้องเปิดเว็บผ่าน https จึงจะใช้ตำแหน่งได้ กรุณาแจ้งผู้ดูแลระบบ'
        )
      );
      return;
    }

    if (!navigator.geolocation) {
      reject(new LocationError('unsupported', 'เครื่องนี้ไม่รองรับการระบุตำแหน่ง'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      (error) => {
        // ค่าคงที่ของเบราว์เซอร์: 1 = ไม่อนุญาต, 2 = หาตำแหน่งไม่ได้, 3 = หมดเวลา
        if (error.code === 1) {
          reject(new LocationError('denied', 'คุณยังไม่ได้อนุญาตให้เข้าถึงตำแหน่ง'));
        } else if (error.code === 3) {
          reject(new LocationError('timeout', 'หาตำแหน่งไม่ทันเวลา'));
        } else {
          reject(new LocationError('unavailable', 'หาตำแหน่งของคุณไม่ได้'));
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

/** ระยะห่างแบบอ่านง่าย ใกล้ ๆ บอกเป็นเมตร ไกลแล้วบอกเป็นกิโลเมตร */
export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} เมตร`;
  return `${(meters / 1000).toFixed(1)} กม.`;
}
