frappe.ui.form.on('Sales Order', {
    refresh: function(frm) {
        
        if (frm.is_new()) {
            frm.doc.processed = 0
        }
        
        const has_valid_items = frm.doc.items.some(item => item.item_code);
        if (!frm.doc.processed && has_valid_items && frm.doc.docstatus === 1) {
            frm.add_custom_button(__('Create Delivery Notes and Send Emails'), async function() {

                const emailTemplates = await fetchEmailTemplates();
                console.log('email templates', emailTemplates)
                
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
                            data: frm.doc.items.map(item => ({
                                item_code: item.item_code,
                                email_template: "",
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

                        dialog_data = dialog_data.reduce((acc, item) => {
                            acc[item.item_code] = item.email_template;
                            return acc;
                        }, {});

                        dialog.hide();
                        
                        frappe.call({
                            method: "ssv_reutlingen.api.custom_sales_order.create_delivery_notes",
                            args: {
                                sales_order: frm.doc.name,
                                dialog_data: dialog_data,
                                items: frm.doc.items
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
                // Prepare an array to hold the fetched email templates
                const emailTemplates = [];
            
                // Loop through each item to fetch the email template
                for (let item of frm.doc.items) {
                    try {
                        // Await the asynchronous frappe call for each item
                        const response = await frappe.call({
                            method: "frappe.client.get_value",
                            args: {
                                doctype: "Item",
                                filters: { name: item.item_code },
                                fieldname: "email_template"
                            }
                        });
            
                        if (response.message && response.message.email_template) {
                            // Store the email template in the array
                            emailTemplates.push({
                                item_code: item.item_code,
                                email_template: response.message.email_template
                            });
                        }
                    } catch (err) {
                        console.error(`Error fetching email template for item: ${item.item_code}`, err);
                    }
                }
            
                return emailTemplates;
            }
        }
    }
});