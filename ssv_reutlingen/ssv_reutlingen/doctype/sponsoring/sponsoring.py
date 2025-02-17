# Copyright (c) 2024, phamos.eu and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import nowdate, add_days, date_diff, getdate
from frappe import _

class Sponsoring(Document):
	def validate(self):
		self.validate_contribution_type()
		self.set_status()

	def validate_contribution_type(self):
		total_contribution_amount = 0
		for ct in self.contribution_type:
			total_contribution_amount += ct.amount
		
		if total_contribution_amount != self.net_total:
			frappe.throw(_("The sum of Contribution Type amounts must equal with Net Total"))

	@frappe.whitelist()
	def calculate_net_total(self):
		total_net_amount = 0
		for item in self.sponsoring_items:
			total_net_amount += item.net_amount
		return total_net_amount

	def set_status(self):
		if self.contract_end and getdate(self.contract_end) < getdate(nowdate()):
			self.status = "Expired"
		else:
			self.status = "Active"

	def enhance_contract(self):
		if self.contract_start and self.contract_end:
			self.contract_end = add_days(self.contract_end, date_diff(self.contract_end, self.contract_start))
			self.contract_start = nowdate()

@frappe.whitelist()
def calculate_grand_total(net_total):
	settings = frappe.get_single("SSV Reutlingen Settings")
	tax_rate = settings.tax_rate or 0
	grand_total = float(net_total) * (1 + tax_rate / 100)
	return grand_total


@frappe.whitelist()
def get_item_details(item_code, company):
	item_defaults = frappe.db.get_value(
		"Item Default",
		{"parent": item_code, "company": company},
		["default_warehouse"],
	)
	
	return item_defaults


@frappe.whitelist()
def sponsoring_contract_auto_management():
	"""Background job to update Sponsoring contract status for renewal or expiration."""

	contracts = frappe.get_all("Sponsoring", fields=["name"])
	for contract in contracts:
		contract = frappe.get_doc("Sponsoring", contract.name)

		if getdate(nowdate()) == contract.contract_end:
			if contract.renew_or_expire == "Renew Automatically":
				contract.enhance_contract()
				contract.save()

			elif contract.renew_or_expire == "Expire Automatically":
				contract.set_status()
				contract.save()



def sponsoring_contract_auto_management_background():
	frappe.enqueue(
		"ssv_reutlingen.ssv_reutlingen.doctype.sponsoring.sponsoring.sponsoring_contract_auto_management",
		queue='long'
	)
