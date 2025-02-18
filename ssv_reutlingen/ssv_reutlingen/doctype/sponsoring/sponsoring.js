// Copyright (c) 2024, phamos.eu and contributors
// For license information, please see license.txt

frappe.ui.form.on('Sponsoring', {
	refresh: function(frm) {
		if (frm.is_new()) {
            frm.set_value('processed', 0);
            const default_company = frappe.defaults.get_default("company");
            if (default_company) {
                frm.set_value("company", default_company);
            }
        }

		const has_valid_items = frm.doc.sponsoring_items ? frm.doc.sponsoring_items.some(item => item.item_code) : false;
        
		if (!frm.doc.processed && has_valid_items) {
			frm.add_custom_button(__('Create Delivery Notes and Send Emails'), async function() {
                const emailTemplates = await fetchEmailTemplates();
                const dialog = new frappe.ui.Dialog({
                    title: __("Create Delivery Notes and Send Emails"),
                    fields: [
                        {
                            fieldtype: "Table",
                            fieldname: "items_with_templates",
                            label: __("Items and Email Templates"),
                            fields: [
                                {
                                    fieldtype: "Link",
                                    fieldname: "item_code",
                                    label: __("Item Code"),
                                    options: 'Item',
                                    in_list_view: 1,
                                },
                                {
                                    fieldtype: "Link",
                                    fieldname: "email_template",
                                    label: __("Email Template"),
                                    options: "Email Template",
                                    in_list_view: 1,
                                    onchange: function(){
                
                                        const data = dialog.fields_dict.items_with_templates.grid.df.get_data()
                                        data.forEach(row => {
                                            const emailTemplate =  row.email_template;
                                            if (emailTemplate) {
                                                frappe.call({
                                                    method: "frappe.client.get",
                                                    args: {
                                                        doctype: "Email Template",
                                                        name: emailTemplate,
                                                    },
                                                    callback: function (response) {
                                                        if (response.message) {
                                                            const template = response.message;
                                                           
                                                            dialog.fields_dict.items_with_templates.df.data.some((doc) => {
                                                                if (doc.email_template == emailTemplate){
                                                                    doc.subject = template.subject || ""
                                                                    doc.response = template.response || ""
                                                                }
                                                        
                                                            });

                                                            dialog.fields_dict.items_with_templates.grid.refresh();
                                                        }
                                                    },
                                                });
                                            }
                                        });
                                    }
                                },
                                {
                                    fieldtype: "Data",
                                    fieldname: "subject",
                                    label: __("Subject"),
                                },
                                {
                                    fieldtype: "Text Editor",
                                    fieldname: "response",
                                    label: __("Response"),
                                },
                            ],
                            data: frm.doc.sponsoring_items.map(item => ({
                                item_code: item.item_code,
                                email_template: emailTemplates.find(et => et.item_code === item.item_code)?.email_template || "",
                                subject: emailTemplates.find(et => et.item_code === item.item_code)?.subject || "",
                                response: emailTemplates.find(et => et.item_code === item.item_code)?.response || "", 
                                edit_option: 0,
                            })),
                            get_data: () => {
                                return dialog.get_value("items_with_templates");
                            },
                        },
                    ],
                    primary_action_label: __("Create Delivery Notes"),
                    primary_action: function() {
                        let dialog_data = dialog.get_value("items_with_templates");

                        if (!dialog_data || !dialog_data.length) {
                            frappe.msgprint(__("Please map at least one Email Template to proceed."));
                            return;
                        }
                        
                        dialog.hide();
                        
                        frappe.call({
                            method: "ssv_reutlingen.api.custom_delivery_note.create_delivery_notes",
                            args: {
                                doctype: "Sponsoring",
                                name: frm.doc.name,
                                dialog_data: dialog_data,
                                items: frm.doc.sponsoring_items
                            },
                            callback: function(response) {
                                if (response.message) {
                                    frm.reload_doc();
                                    frappe.msgprint(__("Delivery Notes created and emails sent successfully!"));
                                }
                            }
                        });
                    },
                });
                dialog.show();
            });

            async function fetchEmailTemplates() {
                const emailTemplates = [];
                for (let item of frm.doc.sponsoring_items) {
                    const response = await frappe.call({
                        method: "ssv_reutlingen.api.custom_delivery_note.get_email_template",
                        args: {
                            item_code: item.item_code
                        }
                    });
                    
                    if (response.message && response.message.email_template) {
                        emailTemplates.push({
                            item_code: item.item_code,
                            email_template: response.message.email_template,
                            subject: response.message.subject,
                            response: response.message.response
                        });
                    }
                }
           
                return emailTemplates;
            }
		}
	},

	onload: function(frm) {
        if(frm.is_new()){
            frappe.call({
                method: 'get_contract_start',
                doc: frm.doc,
                callback: function(res) {
                    if (res.message) {
                        frm.set_value('contract_start', res.message);
                    }
                }
            });
        }
	},

    contract_start: function(frm) {
        frappe.call({
            method: 'get_contract_end_and_notice_dates',
            doc: frm.doc,
            callback: function(res) {
                if (res.message) {
                    frm.set_value('contract_end', res.message[0]);
                    frm.set_value('latest_notice_date', res.message[1]);
                }
            }
        });
	},

    customer: function(frm) {
        frappe.call({
            method: "frappe.client.get",
            args: {
                doctype: "Contact",
                name: frm.doc.customer_primary_contact,
            },
            callback: function (response) {
                if (response.message) {
                    const contact = response.message;
                    frm.set_value('contact_email', contact.email_id)   
                }
            },
        });
        
    },
	
	net_total: function(frm) {
		// Set grand total
		frappe.call({
            method: 'ssv_reutlingen.ssv_reutlingen.doctype.sponsoring.sponsoring.calculate_grand_total',
            args: {
                net_total: frm.doc.net_total
            },
            callback: function(res) {
                if (res.message) {
                    frm.set_value('grand_total', res.message);
                }
            }
        });
	}
});

frappe.ui.form.on('Sponsoring Items', {
    item_code: function(frm, cdt, cdn){
        let row = locals[cdt][cdn];
                
        frappe.call({
            method: 'ssv_reutlingen.ssv_reutlingen.doctype.sponsoring.sponsoring.get_item_details',
            args: {
                item_code: row.item_code,
                company: frm.doc.company
            },
            callback: function(res) {
                if (res.message) {
                    row.warehouse = res.message
                }
            }
        });
        
    },

	net_rate: function(frm,cdt,cdn) {
		let row = locals[cdt][cdn];
		row.net_amount = calculate_amount(row.net_rate, row.qty)
		refresh_field("net_amount", cdn, "sponsoring_items");
		calculate_net_total(frm)
	},

	qty: function(frm,cdt,cdn) {
		let row = locals[cdt][cdn];
		row.net_amount = calculate_amount(row.net_rate, row.qty)
		refresh_field("net_amount", cdn, "sponsoring_items");
		calculate_net_total(frm)
	},

	sponsoring_items_remove: function(frm,cdt,cdn){
		calculate_net_total(frm)
	}
});

function calculate_amount (net_rate, qty) {
	return net_rate * qty
}

function calculate_net_total (frm) {
	frappe.call({
		method: 'calculate_net_total',
		doc: frm.doc,
		callback: function(res) {
			if (res.message) {
				frm.set_value('net_total', res.message);
			}
		}
	});
}