# Copyright (c) 2024, phamos.eu and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import nowdate, add_days, date_diff, getdate
from datetime import datetime, date
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
		if self.contract_end and getdate(self.contract_end) <= getdate(nowdate()):
			self.status = "Expired"
		else:
			self.status = "Active"

	@frappe.whitelist()
	def get_contract_start(self):
		"""Set contract_start to the next 1st of July."""
		today = datetime.today()
		year = today.year

		next_july = datetime(year, 7, 1)
		if today > next_july:
			next_july = datetime(year + 1, 7, 1)

		next_july = next_july.date()
		return next_july

	@frappe.whitelist()
	def get_contract_end_and_notice_dates(self):
		"""Calculate contract_end and latest_notice_date based on contract_start."""
		if self.contract_start:
			contract_start_date = datetime.strptime(str(self.contract_start), '%Y-%m-%d')
			contract_start_year = contract_start_date.year

			contract_end = date(contract_start_year + 1, 6, 30)
			latest_notice_date = date(contract_start_year, 12, 31)
			
			return contract_end, latest_notice_date

	def enhance_contract(self):
		self.contract_start = self.get_contract_start()
		self.contract_end, self.latest_notice_date = self.get_contract_end_and_notice_dates()


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

		if contract.contract_end <= getdate(nowdate()):
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