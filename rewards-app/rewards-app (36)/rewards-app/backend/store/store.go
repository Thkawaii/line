package store

import (
	"database/sql"
	"time"

	"rewards/config"
)

// Row คือหนึ่งแถวที่อ่านมาจากฐานข้อมูล ส่งออกเป็น JSON ได้ตรง ๆ
type Row map[string]any

// Query อ่านหลายแถวออกมาเป็น Row โดยแปลงชนิดวันเวลาให้อยู่ในรูปที่หน้าเว็บใช้ได้
//
// ทำแบบนี้เพราะ API ส่วนใหญ่แค่ส่งผลคิวรีออกไปตรง ๆ
// ถ้าประกาศ struct แยกทุกคิวรีจะยาวโดยไม่ได้อะไรเพิ่ม
func Query(query string, args ...any) ([]Row, error) {
	rows, err := config.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columns, err := rows.ColumnTypes()
	if err != nil {
		return nil, err
	}

	out := make([]Row, 0)
	for rows.Next() {
		values := make([]any, len(columns))
		pointers := make([]any, len(columns))
		for i := range values {
			pointers[i] = &values[i]
		}
		if err := rows.Scan(pointers...); err != nil {
			return nil, err
		}

		row := make(Row, len(columns))
		for i, column := range columns {
			row[column.Name()] = normalize(values[i], column.DatabaseTypeName())
		}
		out = append(out, row)
	}

	return out, rows.Err()
}

// QueryOne อ่านแถวแรก ถ้าไม่มีคืน nil
func QueryOne(query string, args ...any) (Row, error) {
	rows, err := Query(query, args...)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return rows[0], nil
}

func Exec(query string, args ...any) (sql.Result, error) {
	return config.DB.Exec(query, args...)
}

// Count อ่านตัวเลขค่าเดียว เช่น count(*)
func Count(query string, args ...any) (int64, error) {
	var n int64
	err := config.DB.QueryRow(query, args...).Scan(&n)
	return n, err
}

// normalize แปลงค่าที่ได้จากไดรเวอร์ให้เป็นรูปที่หน้าเว็บคาดหวัง
//
//	DATE        -> "2006-01-02"      หน้าเว็บตัด 10 ตัวแรกไปใส่ช่อง input type=date
//	TIME        -> "15:04:05"        หน้าเว็บตัด 5 ตัวแรกเป็น "10:00"
//	TIMESTAMPTZ -> RFC3339           new Date() ฝั่ง JS อ่านได้
func normalize(value any, columnType string) any {
	switch v := value.(type) {
	case time.Time:
		switch columnType {
		case "DATE":
			return v.Format("2006-01-02")
		case "TIME", "TIMETZ":
			return v.Format("15:04:05")
		default:
			return v.Format(time.RFC3339Nano)
		}
	case []byte:
		return string(v)
	default:
		return value
	}
}
