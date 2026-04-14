import openpyxl
import json
import decimal

def main():
    try:
        wb = openpyxl.load_workbook('TEMPLATE_PEDIDOS_PREENCHIDO_COPY.xlsx', data_only=True)
        sheet = wb.active
    except Exception as e:
        print(f"Error reading excel: {e}")
        return

    headers = {cell.value: idx for idx, cell in enumerate(sheet[1])}
    pedido_col = headers.get('NÚMERO DO PEDIDO (1, 2, 3 OU 4)')
    total_col = headers.get('VALOR TOTAL_1')
    item_col = headers.get('ITEM')

    excel_items = {14: {}, 15: {}, 16: {}, 17: {}}

    for row in list(sheet.rows)[1:]:
        pedido_val = row[pedido_col].value if pedido_col is not None else None
        if pedido_val is None: continue
            
        try: p = float(pedido_val)
        except ValueError: continue
            
        if 1 <= p <= 4:
            pedido_idx = int(p) + 13
            val = row[total_col].value if total_col is not None else 0
            try:
                if type(val) == str: val = float(val.replace('.', '').replace(',', '.'))
                elif val is None: val = 0
                else: val = float(val)
            except ValueError: val = 0
                
            item_desc = row[item_col].value if item_col is not None else "UNKNOWN"
            if item_desc not in excel_items[pedido_idx]:
                excel_items[pedido_idx][item_desc] = 0
            
            # Since some items might repeat, we count how many times they appear or just sum values
            # Let's just create a flat list of all rows
            if not hasattr(excel_items[pedido_idx], 'items_list'):
                excel_items[pedido_idx] = []
            
            excel_items[pedido_idx].append({'desc': item_desc, 'val': val})

    with open('excel_items.json', 'w', encoding='utf-8') as f:
        json.dump(excel_items, f, ensure_ascii=False, indent=2)
    print("Exported excel items to json.")

if __name__ == '__main__':
    main()
