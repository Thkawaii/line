// Package org เก็บรายการตำแหน่งงาน แผนก และกติกาสิทธิ์ที่อิงสองอย่างนี้
//
// แยกเป็นแพ็กเกจของตัวเองเพราะทั้ง middleware และ controllers ต้องใช้
// ถ้าปล่อยไว้ใน controllers แล้วให้ middleware เรียก จะเกิดการอ้างวนกัน
// (controllers อ้าง middleware อยู่แล้ว)
//
// หน้าเว็บมีสำเนารายการนี้ที่ frontend/src/lib/org.js — แก้ที่ไหนต้องแก้ให้ตรงกัน
package org

import (
	"sort"
	"strings"
)

/*
Positions เรียงจากตำแหน่งสูงสุดลงไปต่ำสุด

ลำดับมีความหมาย ใช้แสดงผลให้ผู้ดูแลเลือกได้ง่าย จึงห้ามเรียงใหม่ตามตัวอักษร
*/
var Positions = []string{
	"Director",
	"Co-General Manager",
	"Assistant General Manager",
	"Co-Manager",
	"Manager",
	"Assistant Manager",
	"Specialist",
	"Chief Engineer",
	"Senior Engineer",
	"Engineer",
	"Chief Officer",
	"Senior Officer",
	"Officer",
	"Coordinator",
	"Translator",
	"Supervisor",
	"Instructor Supervisor",
	"Instructor Leader",
	"Leader",
	"Instructor Sub-Leader",
	"Sub-Leader",
	"Clerk",
	"CNC Controller",
	"Inspector",
	"Maintenance",
	"Safety Operator",
	"Assembly Worker",
	"Welder",
	"Painter",
	"W/H Worker",
	"P/K Worker",
	"S/B Worker",
	"Driver",
	"Maid",
}

// Sections คือรหัสแผนกทั้งหมด เรียงตามตัวอักษรเพราะไม่มีลำดับชั้น
var Sections = []string{
	"ACC", "ASS", "BID", "ER", "ERG", "FNS", "FTS", "GAG", "HRD", "HRM",
	"ISO", "ITS", "LOG", "MTS", "PCM", "PCP", "PCT", "PDF", "PDS", "PES",
	"PIS", "PLS", "PNG", "PRC", "PSS", "QAS", "QCS", "SMD", "STS", "TSF",
	"TTS",
}

// Branches คือสาขาหรือโรงงาน ใช้เป็นคอลัมน์ Location ในรายงาน
var Branches = []string{"PD", "TS", "BKK"}

/*
BackOfficeSections คือแผนกที่เข้าหน้าผู้ดูแลระบบได้ด้วยรหัสพนักงานของตัวเอง

พนักงานในแผนกเหล่านี้ใช้รหัสพนักงานกับรหัสผ่านเดิมเข้าได้ทั้งสองฝั่ง
ไม่ต้องสร้างบัญชีผู้ดูแลระบบแยกอีกใบ

สิ่งที่ทำไม่ได้คือกลุ่มเมนู "ตั้งค่าระบบ" (บัญชีผู้ดูแลระบบ, Audit Logs, System Settings)
ซึ่งเป็นของผู้ดูแลระบบตัวจริงเท่านั้น
*/
// รับทั้งสองแบบที่ใช้เรียกกันจริง เพราะรหัสแผนกในทะเบียนพนักงานกับที่พูดกันปากเปล่าไม่ตรงกัน
//   GA  กับ GAG  คือฝ่ายธุรการเหมือนกัน (ทะเบียนพนักงานใช้ GAG)
//   HR  กับ HRM / HRD  คือฝ่ายบุคคลเหมือนกัน (ทะเบียนพนักงานใช้ HRM และ HRD)
// ถ้าเขียนแค่ฝั่งใดฝั่งหนึ่ง พนักงานที่เลือกอีกรหัสจะเข้าหลังบ้านไม่ได้เลย
var BackOfficeSections = []string{"GA", "GAG", "ER", "HR", "HRM", "HRD"}

// AdminSections คือแผนกที่ให้เลือกตอนสร้างบัญชีผู้ดูแลระบบ
var AdminSections = BackOfficeSections

// AllSections คือรายการแผนกที่ให้เลือกในหน้าจัดการพนักงาน
//
// รวมรหัสของแผนกหลังบ้านเข้าไปด้วย เพราะรายการหลักไม่มี GA กับ HR
// ถ้าไม่รวม พนักงานฝ่ายธุรการและฝ่ายบุคคลจะเลือกแผนกของตัวเองจากรายการไม่ได้
// ต้องไปกด "อื่นๆ" แล้วพิมพ์เอง ซึ่งพิมพ์ผิดเมื่อไหร่สิทธิ์เข้าหลังบ้านก็หายทันที
var AllSections = buildAllSections()

func buildAllSections() []string {
	out := append([]string{}, Sections...)
	for _, section := range BackOfficeSections {
		if !contains(out, section) {
			out = append(out, section)
		}
	}
	sort.Strings(out)
	return out
}

/*
AdjustPointsPositions คือตำแหน่งที่ปรับคะแนนพนักงานได้

ต้องอยู่ในแผนก BackOfficeSections ด้วย ทั้งสองเงื่อนไขต้องผ่านพร้อมกัน
ผู้จัดการฝ่ายผลิตจึงปรับคะแนนไม่ได้ แม้ตำแหน่งจะชื่อเดียวกัน

รายการนี้ไม่ได้เรียงตามลำดับชั้น แต่เป็นรายชื่อที่ระบุมาเฉพาะเจาะจง
จึงเทียบแบบ "อยู่ในรายการหรือไม่" ไม่ใช่ "สูงกว่าตำแหน่งนี้หรือไม่"
*/
var AdjustPointsPositions = []string{
	"Co-General Manager",
	"Assistant General Manager",
	"Co-Manager",
	"Manager",
	"Assistant Manager",
	"Chief Officer",
}

// contains เทียบแบบไม่สนตัวพิมพ์เล็กใหญ่และช่องว่างหัวท้าย
// เพราะข้อมูลที่นำเข้าจากไฟล์ Excel มักมีช่องว่างติดมาหรือพิมพ์ต่างกันเล็กน้อย
func contains(list []string, value string) bool {
	target := strings.ToLower(strings.TrimSpace(value))
	if target == "" {
		return false
	}
	for _, item := range list {
		if strings.ToLower(item) == target {
			return true
		}
	}
	return false
}

// IsBackOfficeSection บอกว่าแผนกนี้เข้าหน้าผู้ดูแลระบบได้หรือไม่
func IsBackOfficeSection(section string) bool {
	return contains(BackOfficeSections, section)
}

// CanAdjustPoints บอกว่าแผนกและตำแหน่งนี้ปรับคะแนนได้หรือไม่
//
// ต้องผ่านทั้งสองเงื่อนไข: อยู่ในแผนกหลังบ้าน และมีตำแหน่งอยู่ในรายการ
//
// ใช้กับ "ตัดยอดคะแนนประจำปี" เท่านั้นแล้ว การปรับคะแนนรายคนย้ายไปใช้
// ระบบยื่นขออนุมัติด้านล่าง ซึ่งเปิดให้ทุกตำแหน่งยื่นได้แต่ต้องมีคนอนุมัติ
func CanAdjustPoints(section, position string) bool {
	return IsBackOfficeSection(section) && contains(AdjustPointsPositions, position)
}

/* ---------- การปรับคะแนนแบบต้องขออนุมัติ ---------- */

/*
PointRequestSections คือแผนกที่ยื่นขอปรับคะแนนพนักงานได้

ER, GA, HR ยื่นได้ทุกตำแหน่ง ไม่ดูระดับตำแหน่งเลย
เพราะคนที่รู้เรื่องจริงว่าใครควรได้คะแนนคืนมักเป็นคนหน้างาน ไม่ใช่หัวหน้า
ส่วนการกันความผิดพลาดย้ายไปอยู่ที่ขั้นอนุมัติแทน

รับรหัสทั้งสองแบบที่ใช้เรียกกันจริง เหมือน BackOfficeSections
*/
var PointRequestSections = []string{"ER", "ERG", "GA", "GAG", "HR", "HRM", "HRD"}

/*
GASections และ HRSections คือแผนกของผู้อนุมัติสองฝั่ง

คำขอหนึ่งใบต้องได้ทั้งฝั่ง GA และฝั่ง HR อย่างละคน
ER ยื่นขอได้แต่อนุมัติไม่ได้ เพราะกติกาที่ตกลงกันระบุผู้อนุมัติไว้แค่สองฝั่งนี้
*/
var (
	GASections = []string{"GA", "GAG"}
	HRSections = []string{"HR", "HRM", "HRD"}
)

/*
MinApproverPosition คือตำแหน่งต่ำสุดที่อนุมัติคำขอปรับคะแนนได้

"ขึ้นไป" วัดจากลำดับใน Positions ซึ่งเรียงจากสูงสุดลงต่ำสุด
ตำแหน่งที่อยู่เหนือหรือเท่ากับตำแหน่งนี้ในรายการถือว่าผ่าน

ถ้าต่อไปอยากเปลี่ยนเกณฑ์ แก้ค่านี้ค่าเดียว ไม่ต้องไล่แก้รายชื่อ
*/
const MinApproverPosition = "Chief Officer"

// PositionRank คืนลำดับของตำแหน่งใน Positions ยิ่งเลขน้อยยิ่งสูง
// ตำแหน่งที่ไม่อยู่ในรายการ (ผู้ดูแลพิมพ์เอง) คืน false
func PositionRank(position string) (int, bool) {
	target := strings.ToLower(strings.TrimSpace(position))
	if target == "" {
		return 0, false
	}
	for i, item := range Positions {
		if strings.ToLower(item) == target {
			return i, true
		}
	}
	return 0, false
}

// IsApproverPosition บอกว่าตำแหน่งนี้สูงพอจะอนุมัติคำขอปรับคะแนนหรือไม่
//
// ตำแหน่งที่พิมพ์เองนอกรายการมาตรฐานถือว่าไม่ผ่าน
// เพราะเทียบลำดับชั้นกับตำแหน่งที่ไม่รู้จักไม่ได้ และการเดาในเรื่องสิทธิ์คือการเดาผิดฝั่ง
func IsApproverPosition(position string) bool {
	rank, ok := PositionRank(position)
	if !ok {
		return false
	}
	limit, _ := PositionRank(MinApproverPosition)
	return rank <= limit
}

// CanRequestPointAdjust บอกว่าแผนกนี้ยื่นขอปรับคะแนนได้หรือไม่ ทุกตำแหน่งในแผนกยื่นได้
func CanRequestPointAdjust(section string) bool {
	return contains(PointRequestSections, section)
}

/*
ApproverGroup คืนฝั่งของผู้อนุมัติตามแผนก: "GA", "HR" หรือว่างถ้าอนุมัติไม่ได้

ดูแค่แผนก ยังไม่ดูตำแหน่ง ใช้คู่กับ IsApproverPosition
*/
func ApproverGroup(section string) string {
	switch {
	case contains(GASections, section):
		return "GA"
	case contains(HRSections, section):
		return "HR"
	}
	return ""
}

// CanApprovePointAdjust คืนฝั่งที่อนุมัติได้ และบอกว่าอนุมัติได้หรือไม่
//
// ต้องผ่านทั้งสองอย่าง: อยู่ฝั่ง GA หรือ HR และตำแหน่งตั้งแต่ Chief Officer ขึ้นไป
func CanApprovePointAdjust(section, position string) (string, bool) {
	group := ApproverGroup(section)
	if group == "" || !IsApproverPosition(position) {
		return "", false
	}
	return group, true
}
