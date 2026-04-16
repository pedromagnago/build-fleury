BEGIN;

DELETE FROM parcelas WHERE pedido_id = '31eda758-41ed-446f-9912-85ee9a3b0d9b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('31eda758-41ed-446f-9912-85ee9a3b0d9b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 21900.84, '2026-04-28', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a6ef188e-9dd7-467c-8244-181848c026bc';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a6ef188e-9dd7-467c-8244-181848c026bc', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 21900.84, '2026-05-11', 'futura');
DELETE FROM parcelas WHERE pedido_id = '72657366-290d-459d-8265-a6a4c507cc3f';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('72657366-290d-459d-8265-a6a4c507cc3f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1140.48, '2026-04-17', 'futura'),
('72657366-290d-459d-8265-a6a4c507cc3f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 1140.48, '2026-05-18', 'futura'),
('72657366-290d-459d-8265-a6a4c507cc3f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 1140.48, '2026-06-17', 'futura'),
('72657366-290d-459d-8265-a6a4c507cc3f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 4, 1140.48, '2026-07-17', 'futura');
DELETE FROM parcelas WHERE pedido_id = '1d53bce6-67f6-4257-a503-511a9844b774';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('1d53bce6-67f6-4257-a503-511a9844b774', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 868.48, '2026-04-17', 'futura'),
('1d53bce6-67f6-4257-a503-511a9844b774', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 868.48, '2026-05-18', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'defa2dc2-a611-44ac-8205-a5c58395ba57';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('defa2dc2-a611-44ac-8205-a5c58395ba57', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 43392.34, '2026-04-28', 'futura'),
('defa2dc2-a611-44ac-8205-a5c58395ba57', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 43392.34, '2026-05-12', 'futura'),
('defa2dc2-a611-44ac-8205-a5c58395ba57', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 43392.36, '2026-05-26', 'futura');
DELETE FROM parcelas WHERE pedido_id = '6824228b-b29b-44f8-b7d7-f902f840642c';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('6824228b-b29b-44f8-b7d7-f902f840642c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 164638.72, '2026-04-28', 'futura');
DELETE FROM parcelas WHERE pedido_id = '23d40e97-0165-4926-90df-9a9cfd4017d2';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('23d40e97-0165-4926-90df-9a9cfd4017d2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 10664.06, '2026-04-28', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'd8eb9c98-c53c-479d-9044-d74fa43720bc';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('d8eb9c98-c53c-479d-9044-d74fa43720bc', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 9829.28, '2026-04-27', 'futura'),
('d8eb9c98-c53c-479d-9044-d74fa43720bc', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 9829.28, '2026-05-27', 'futura'),
('d8eb9c98-c53c-479d-9044-d74fa43720bc', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 9829.28, '2026-06-26', 'futura');
DELETE FROM parcelas WHERE pedido_id = '33cb75dd-e46d-44ba-9d5f-c5b268d0f4fd';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('33cb75dd-e46d-44ba-9d5f-c5b268d0f4fd', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 24928, '2026-04-28', 'futura'),
('33cb75dd-e46d-44ba-9d5f-c5b268d0f4fd', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 24928, '2026-05-28', 'futura'),
('33cb75dd-e46d-44ba-9d5f-c5b268d0f4fd', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 24928, '2026-06-29', 'futura');
DELETE FROM parcelas WHERE pedido_id = '79987b4f-e170-4f28-80b8-c1c4989e1d9a';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('79987b4f-e170-4f28-80b8-c1c4989e1d9a', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 15039.06, '2026-05-15', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a2061f87-a097-4ab2-8dad-d390e6e3fb12';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a2061f87-a097-4ab2-8dad-d390e6e3fb12', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 179200, '2026-05-15', 'futura');
DELETE FROM parcelas WHERE pedido_id = '794a1675-0e35-48b4-b8dc-403a4b253885';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('794a1675-0e35-48b4-b8dc-403a4b253885', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 6840, '2026-05-15', 'futura'),
('794a1675-0e35-48b4-b8dc-403a4b253885', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 6840, '2026-06-15', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'dd8f7f01-cbba-49ec-a7ca-e9301d330e3f';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('dd8f7f01-cbba-49ec-a7ca-e9301d330e3f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 600, '2026-05-15', 'futura'),
('dd8f7f01-cbba-49ec-a7ca-e9301d330e3f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 600, '2026-06-15', 'futura');
DELETE FROM parcelas WHERE pedido_id = '027b4177-817b-4ab0-92fa-ee35adfe30ba';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('027b4177-817b-4ab0-92fa-ee35adfe30ba', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 720, '2026-05-15', 'futura'),
('027b4177-817b-4ab0-92fa-ee35adfe30ba', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 720, '2026-06-15', 'futura');
DELETE FROM parcelas WHERE pedido_id = '153b3318-bc1a-4355-9cdf-286b241e0355';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('153b3318-bc1a-4355-9cdf-286b241e0355', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1272.82, '2026-05-28', 'futura');
DELETE FROM parcelas WHERE pedido_id = '7c8c618c-b4c0-4a57-adae-cc73da6d4c5a';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('7c8c618c-b4c0-4a57-adae-cc73da6d4c5a', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 720, '2026-05-28', 'futura');
DELETE FROM parcelas WHERE pedido_id = '4cfa670e-ff29-40b2-8d32-12ffb9b3bc74';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('4cfa670e-ff29-40b2-8d32-12ffb9b3bc74', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2400, '2026-05-28', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'be3a9695-ac0b-4cec-98c1-88cb14284e8f';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('be3a9695-ac0b-4cec-98c1-88cb14284e8f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 4096, '2026-05-05', 'futura'),
('be3a9695-ac0b-4cec-98c1-88cb14284e8f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 4096, '2026-06-02', 'futura'),
('be3a9695-ac0b-4cec-98c1-88cb14284e8f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 4096, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'f034f0a2-daaa-44d5-ac6c-eb1590d8f12d';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('f034f0a2-daaa-44d5-ac6c-eb1590d8f12d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 10.13, '2026-05-05', 'futura'),
('f034f0a2-daaa-44d5-ac6c-eb1590d8f12d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 10.13, '2026-06-02', 'futura'),
('f034f0a2-daaa-44d5-ac6c-eb1590d8f12d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 10.14, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = '172191b3-9b30-4f5f-ba91-5c909c45609f';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('172191b3-9b30-4f5f-ba91-5c909c45609f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 11.73, '2026-05-05', 'futura'),
('172191b3-9b30-4f5f-ba91-5c909c45609f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 11.73, '2026-06-02', 'futura'),
('172191b3-9b30-4f5f-ba91-5c909c45609f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 11.74, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = '417fc540-1418-4073-a36b-573dd37f0506';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('417fc540-1418-4073-a36b-573dd37f0506', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 10.13, '2026-05-05', 'futura'),
('417fc540-1418-4073-a36b-573dd37f0506', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 10.13, '2026-06-02', 'futura'),
('417fc540-1418-4073-a36b-573dd37f0506', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 10.14, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = '0c18dcbe-6dce-4df9-8c59-2e003163b00b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('0c18dcbe-6dce-4df9-8c59-2e003163b00b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 285.69, '2026-05-05', 'futura'),
('0c18dcbe-6dce-4df9-8c59-2e003163b00b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 285.69, '2026-06-02', 'futura'),
('0c18dcbe-6dce-4df9-8c59-2e003163b00b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 285.69, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ba4e111a-cfb8-44d1-b339-7b2be85c721e';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ba4e111a-cfb8-44d1-b339-7b2be85c721e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 11976, '2026-05-21', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'e2ff5b22-b86d-4a96-bba3-c77d08f1eb2d';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('e2ff5b22-b86d-4a96-bba3-c77d08f1eb2d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2227.43, '2026-05-21', 'futura');
DELETE FROM parcelas WHERE pedido_id = '35c78ca3-4067-4a7f-934d-3eb5222300fa';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('35c78ca3-4067-4a7f-934d-3eb5222300fa', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1864.8, '2026-05-21', 'futura');
DELETE FROM parcelas WHERE pedido_id = '04426e98-1bcd-4801-91fc-b8eeab7dc149';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('04426e98-1bcd-4801-91fc-b8eeab7dc149', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1286.67, '2026-05-21', 'futura');
DELETE FROM parcelas WHERE pedido_id = '8ac7c27d-cb96-4bf1-b797-63df3e2e530a';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('8ac7c27d-cb96-4bf1-b797-63df3e2e530a', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2671.2, '2026-04-21', 'futura');
DELETE FROM parcelas WHERE pedido_id = '44141351-0b3c-450f-97c7-9b53a63ec45b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('44141351-0b3c-450f-97c7-9b53a63ec45b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 755.64, '2026-05-21', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ae8ac316-48b2-47fe-ae53-af549d1b031b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ae8ac316-48b2-47fe-ae53-af549d1b031b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 178.13, '2026-05-05', 'futura'),
('ae8ac316-48b2-47fe-ae53-af549d1b031b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 178.13, '2026-06-02', 'futura'),
('ae8ac316-48b2-47fe-ae53-af549d1b031b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 178.14, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ebaa9fcf-05f6-412c-98e9-9066823ccb41';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ebaa9fcf-05f6-412c-98e9-9066823ccb41', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 328.06, '2026-05-05', 'futura'),
('ebaa9fcf-05f6-412c-98e9-9066823ccb41', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 328.06, '2026-06-02', 'futura'),
('ebaa9fcf-05f6-412c-98e9-9066823ccb41', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 328.07, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a23bee75-d534-44dd-951f-15e0f8c711e7';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a23bee75-d534-44dd-951f-15e0f8c711e7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 132.26, '2026-05-05', 'futura'),
('a23bee75-d534-44dd-951f-15e0f8c711e7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 132.26, '2026-06-02', 'futura'),
('a23bee75-d534-44dd-951f-15e0f8c711e7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 132.28, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'cfd4b2ab-06ea-4eca-95d4-90a2c5f838bd';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('cfd4b2ab-06ea-4eca-95d4-90a2c5f838bd', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 14.22, '2026-04-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '307878d7-a6ef-442f-8eb6-d05b7d1c7c64';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('307878d7-a6ef-442f-8eb6-d05b7d1c7c64', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1600, '2026-04-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = '38182f81-4b4e-4d1d-9b24-42f3ffefd8c3';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('38182f81-4b4e-4d1d-9b24-42f3ffefd8c3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1125.6, '2026-04-10', 'futura');
DELETE FROM parcelas WHERE pedido_id = '1c6f4598-24ee-4e26-ae83-750628a75d67';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('1c6f4598-24ee-4e26-ae83-750628a75d67', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2251.2, '2026-04-10', 'futura');
DELETE FROM parcelas WHERE pedido_id = '32a0be5e-88fe-4b50-84dc-7194c6628ca2';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('32a0be5e-88fe-4b50-84dc-7194c6628ca2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2251.2, '2026-04-10', 'futura');
DELETE FROM parcelas WHERE pedido_id = '7819ae72-fa54-42c7-bc2e-a1427b03d455';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('7819ae72-fa54-42c7-bc2e-a1427b03d455', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 550.8, '2026-05-25', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c03aea46-dbc0-4eec-9134-f19358698083';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c03aea46-dbc0-4eec-9134-f19358698083', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1021.28, '2026-05-25', 'futura');
DELETE FROM parcelas WHERE pedido_id = '85846e1c-27dd-40bb-bf57-7181bfa3b6fb';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('85846e1c-27dd-40bb-bf57-7181bfa3b6fb', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1161.12, '2026-05-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c8b296f3-af6a-4560-b33c-d8ffc74576c3';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c8b296f3-af6a-4560-b33c-d8ffc74576c3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 240, '2026-04-10', 'futura');
DELETE FROM parcelas WHERE pedido_id = '6342d7ed-7715-40a7-823b-020ca7fca936';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('6342d7ed-7715-40a7-823b-020ca7fca936', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1433.6, '2026-05-07', 'futura'),
('6342d7ed-7715-40a7-823b-020ca7fca936', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 1433.6, '2026-05-21', 'futura'),
('6342d7ed-7715-40a7-823b-020ca7fca936', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 1433.6, '2026-06-04', 'futura');
DELETE FROM parcelas WHERE pedido_id = '3cd06616-3e7e-4113-b432-a280a179f9c4';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('3cd06616-3e7e-4113-b432-a280a179f9c4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 673.92, '2026-05-11', 'futura');
DELETE FROM parcelas WHERE pedido_id = '5d06acf0-6051-4dce-a583-7b536ad11620';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('5d06acf0-6051-4dce-a583-7b536ad11620', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 27.52, '2026-05-05', 'futura'),
('5d06acf0-6051-4dce-a583-7b536ad11620', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 27.52, '2026-06-02', 'futura'),
('5d06acf0-6051-4dce-a583-7b536ad11620', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 27.52, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = '50ab7ed7-d25f-45c8-a015-587d7a81ff67';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('50ab7ed7-d25f-45c8-a015-587d7a81ff67', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 13.33, '2026-05-05', 'futura'),
('50ab7ed7-d25f-45c8-a015-587d7a81ff67', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 13.33, '2026-06-02', 'futura'),
('50ab7ed7-d25f-45c8-a015-587d7a81ff67', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 13.34, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = '2c0ecb20-5d94-477a-b5df-d9a74347c905';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('2c0ecb20-5d94-477a-b5df-d9a74347c905', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 53.12, '2026-05-05', 'futura'),
('2c0ecb20-5d94-477a-b5df-d9a74347c905', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 53.12, '2026-06-02', 'futura'),
('2c0ecb20-5d94-477a-b5df-d9a74347c905', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 53.12, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'beb63d18-24e7-42dc-a597-3a8ba2b1f51f';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('beb63d18-24e7-42dc-a597-3a8ba2b1f51f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 61.33, '2026-05-05', 'futura'),
('beb63d18-24e7-42dc-a597-3a8ba2b1f51f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 61.33, '2026-06-02', 'futura'),
('beb63d18-24e7-42dc-a597-3a8ba2b1f51f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 61.34, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = '781d2f4b-065b-48fd-ac9c-ee84348b86d6';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('781d2f4b-065b-48fd-ac9c-ee84348b86d6', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 261.44, '2026-05-05', 'futura'),
('781d2f4b-065b-48fd-ac9c-ee84348b86d6', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 261.44, '2026-06-02', 'futura'),
('781d2f4b-065b-48fd-ac9c-ee84348b86d6', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 261.44, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c45887b0-fdfb-4f26-a7ec-84725e478c33';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c45887b0-fdfb-4f26-a7ec-84725e478c33', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 233.6, '2026-05-05', 'futura'),
('c45887b0-fdfb-4f26-a7ec-84725e478c33', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 233.6, '2026-06-02', 'futura'),
('c45887b0-fdfb-4f26-a7ec-84725e478c33', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 233.6, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = '094c2cc9-c821-4b17-abf0-62b0b6fc5c75';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('094c2cc9-c821-4b17-abf0-62b0b6fc5c75', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 48.85, '2026-05-05', 'futura'),
('094c2cc9-c821-4b17-abf0-62b0b6fc5c75', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 48.85, '2026-06-02', 'futura'),
('094c2cc9-c821-4b17-abf0-62b0b6fc5c75', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 48.86, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'e9f8c469-4941-4f1d-935d-8592fd7cce6d';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('e9f8c469-4941-4f1d-935d-8592fd7cce6d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 17.92, '2026-05-05', 'futura'),
('e9f8c469-4941-4f1d-935d-8592fd7cce6d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 17.92, '2026-06-02', 'futura'),
('e9f8c469-4941-4f1d-935d-8592fd7cce6d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 17.92, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = '6abbf029-57d5-4839-99e4-17026d4ba1b6';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('6abbf029-57d5-4839-99e4-17026d4ba1b6', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 52, '2026-05-05', 'futura'),
('6abbf029-57d5-4839-99e4-17026d4ba1b6', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 52, '2026-06-02', 'futura'),
('6abbf029-57d5-4839-99e4-17026d4ba1b6', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 52, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = '590051fc-96f6-4765-b596-20516fbd2b5b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('590051fc-96f6-4765-b596-20516fbd2b5b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2326.93, '2026-05-05', 'futura'),
('590051fc-96f6-4765-b596-20516fbd2b5b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2326.93, '2026-06-02', 'futura'),
('590051fc-96f6-4765-b596-20516fbd2b5b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2326.94, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'd141bc81-3a7b-4c85-8958-cf20a2175a90';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('d141bc81-3a7b-4c85-8958-cf20a2175a90', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 232.96, '2026-05-05', 'futura'),
('d141bc81-3a7b-4c85-8958-cf20a2175a90', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 232.96, '2026-06-02', 'futura'),
('d141bc81-3a7b-4c85-8958-cf20a2175a90', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 232.96, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = '7a22951c-fd0d-4582-8f80-2d444181918b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('7a22951c-fd0d-4582-8f80-2d444181918b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1317.12, '2026-05-05', 'futura'),
('7a22951c-fd0d-4582-8f80-2d444181918b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 1317.12, '2026-06-02', 'futura'),
('7a22951c-fd0d-4582-8f80-2d444181918b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 1317.12, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'dd59e78d-2fa7-4f35-b46a-2c6956ba7985';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('dd59e78d-2fa7-4f35-b46a-2c6956ba7985', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1030.57, '2026-05-05', 'futura'),
('dd59e78d-2fa7-4f35-b46a-2c6956ba7985', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 1030.57, '2026-06-02', 'futura'),
('dd59e78d-2fa7-4f35-b46a-2c6956ba7985', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 1030.57, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = '9699f60e-2375-4024-ab98-5b6f2a8bb76e';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('9699f60e-2375-4024-ab98-5b6f2a8bb76e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 28.48, '2026-05-05', 'futura'),
('9699f60e-2375-4024-ab98-5b6f2a8bb76e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 28.48, '2026-06-02', 'futura'),
('9699f60e-2375-4024-ab98-5b6f2a8bb76e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 28.48, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = '9ee7d415-e241-47ee-a0d9-62de9161043b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('9ee7d415-e241-47ee-a0d9-62de9161043b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 59.62, '2026-05-05', 'futura'),
('9ee7d415-e241-47ee-a0d9-62de9161043b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 59.62, '2026-06-02', 'futura'),
('9ee7d415-e241-47ee-a0d9-62de9161043b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 59.64, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = '75d12cc1-1a78-4798-9716-5d379072d11b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('75d12cc1-1a78-4798-9716-5d379072d11b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 24.31, '2026-05-05', 'futura'),
('75d12cc1-1a78-4798-9716-5d379072d11b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 24.31, '2026-06-02', 'futura'),
('75d12cc1-1a78-4798-9716-5d379072d11b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 24.34, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = '8c80988f-0cc6-4c24-8d9a-1a050c4ebc41';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('8c80988f-0cc6-4c24-8d9a-1a050c4ebc41', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 232.96, '2026-05-05', 'futura'),
('8c80988f-0cc6-4c24-8d9a-1a050c4ebc41', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 232.96, '2026-06-02', 'futura'),
('8c80988f-0cc6-4c24-8d9a-1a050c4ebc41', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 232.96, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'd90fb9b3-7a1d-47bb-b83b-80c9b632f86d';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('d90fb9b3-7a1d-47bb-b83b-80c9b632f86d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 612.69, '2026-04-27', 'futura'),
('d90fb9b3-7a1d-47bb-b83b-80c9b632f86d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 612.69, '2026-05-25', 'futura'),
('d90fb9b3-7a1d-47bb-b83b-80c9b632f86d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 612.7, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '3826abbf-5152-408a-95da-9ab4dc3f98ee';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('3826abbf-5152-408a-95da-9ab4dc3f98ee', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 324.9, '2026-04-27', 'futura'),
('3826abbf-5152-408a-95da-9ab4dc3f98ee', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 324.9, '2026-05-25', 'futura'),
('3826abbf-5152-408a-95da-9ab4dc3f98ee', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 324.92, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '908dd6c8-8836-4db4-a116-dab8aa417558';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('908dd6c8-8836-4db4-a116-dab8aa417558', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 61.65, '2026-04-27', 'futura'),
('908dd6c8-8836-4db4-a116-dab8aa417558', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 61.65, '2026-05-25', 'futura'),
('908dd6c8-8836-4db4-a116-dab8aa417558', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 61.66, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '1847e4be-a861-4c82-9899-b93910207368';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('1847e4be-a861-4c82-9899-b93910207368', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 51.73, '2026-04-27', 'futura'),
('1847e4be-a861-4c82-9899-b93910207368', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 51.73, '2026-05-25', 'futura'),
('1847e4be-a861-4c82-9899-b93910207368', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 51.74, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '1259d04c-e3f6-4a6f-a490-925cae1114fe';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('1259d04c-e3f6-4a6f-a490-925cae1114fe', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 159.36, '2026-04-27', 'futura'),
('1259d04c-e3f6-4a6f-a490-925cae1114fe', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 159.36, '2026-05-25', 'futura'),
('1259d04c-e3f6-4a6f-a490-925cae1114fe', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 159.36, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'e63b73c2-c206-46ca-a5c0-3e1d80dc44ea';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('e63b73c2-c206-46ca-a5c0-3e1d80dc44ea', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 266.66, '2026-04-27', 'futura'),
('e63b73c2-c206-46ca-a5c0-3e1d80dc44ea', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 266.66, '2026-05-25', 'futura'),
('e63b73c2-c206-46ca-a5c0-3e1d80dc44ea', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 266.68, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'bd0c5d7a-655e-4f06-892b-30be9c8012bf';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('bd0c5d7a-655e-4f06-892b-30be9c8012bf', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 29.33, '2026-04-27', 'futura'),
('bd0c5d7a-655e-4f06-892b-30be9c8012bf', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 29.33, '2026-05-25', 'futura'),
('bd0c5d7a-655e-4f06-892b-30be9c8012bf', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 29.34, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '275ed706-ebd5-4424-95bb-f21fd9448c57';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('275ed706-ebd5-4424-95bb-f21fd9448c57', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 64.85, '2026-04-27', 'futura'),
('275ed706-ebd5-4424-95bb-f21fd9448c57', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 64.85, '2026-05-25', 'futura'),
('275ed706-ebd5-4424-95bb-f21fd9448c57', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 64.86, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '5847b3b2-77e1-4c82-805f-ec1798b3483a';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('5847b3b2-77e1-4c82-805f-ec1798b3483a', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 25.6, '2026-04-27', 'futura'),
('5847b3b2-77e1-4c82-805f-ec1798b3483a', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 25.6, '2026-05-25', 'futura'),
('5847b3b2-77e1-4c82-805f-ec1798b3483a', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 25.6, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ecc23d52-9e8a-4cf2-8918-935b2ed1c769';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ecc23d52-9e8a-4cf2-8918-935b2ed1c769', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 25.38, '2026-04-27', 'futura'),
('ecc23d52-9e8a-4cf2-8918-935b2ed1c769', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 25.38, '2026-05-25', 'futura'),
('ecc23d52-9e8a-4cf2-8918-935b2ed1c769', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 25.4, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'f48cd424-d90d-4139-9ff4-d357c22d1ab9';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('f48cd424-d90d-4139-9ff4-d357c22d1ab9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 47.68, '2026-04-27', 'futura'),
('f48cd424-d90d-4139-9ff4-d357c22d1ab9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 47.68, '2026-05-25', 'futura'),
('f48cd424-d90d-4139-9ff4-d357c22d1ab9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 47.68, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '547808fd-06bc-4b9b-b47b-d46437e85d68';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('547808fd-06bc-4b9b-b47b-d46437e85d68', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 7416, '2026-05-08', 'futura'),
('547808fd-06bc-4b9b-b47b-d46437e85d68', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 7416, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c31cd42c-68c6-4798-9ea8-4814a29bed95';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c31cd42c-68c6-4798-9ea8-4814a29bed95', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 7416, '2026-05-08', 'futura'),
('c31cd42c-68c6-4798-9ea8-4814a29bed95', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 7416, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = '7d9df239-4609-4f50-8095-8c3b5a9a1800';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('7d9df239-4609-4f50-8095-8c3b5a9a1800', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 3708, '2026-05-08', 'futura'),
('7d9df239-4609-4f50-8095-8c3b5a9a1800', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 3708, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = '4ef72027-5310-405b-b861-4c3538408b86';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('4ef72027-5310-405b-b861-4c3538408b86', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 6144, '2026-05-08', 'futura'),
('4ef72027-5310-405b-b861-4c3538408b86', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 6144, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = '91e1e9a1-c831-421c-925f-e146ba457b27';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('91e1e9a1-c831-421c-925f-e146ba457b27', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2236.8, '2026-05-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '3f8de8a4-c1c6-4a30-bc43-53b200b9d703';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('3f8de8a4-c1c6-4a30-bc43-53b200b9d703', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 420, '2026-05-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c1977e8e-154e-4315-8f96-c71c58b657ca';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c1977e8e-154e-4315-8f96-c71c58b657ca', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2448, '2026-05-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '26cd7fdf-fed4-48af-9cb3-7c08583a90a8';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('26cd7fdf-fed4-48af-9cb3-7c08583a90a8', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 51.78, '2026-05-07', 'futura'),
('26cd7fdf-fed4-48af-9cb3-7c08583a90a8', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 51.78, '2026-05-21', 'futura'),
('26cd7fdf-fed4-48af-9cb3-7c08583a90a8', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 51.8, '2026-06-04', 'futura');
DELETE FROM parcelas WHERE pedido_id = '1a788eb6-dee7-421f-986a-5b6485be2186';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('1a788eb6-dee7-421f-986a-5b6485be2186', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 9228.16, '2026-05-15', 'futura'),
('1a788eb6-dee7-421f-986a-5b6485be2186', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 9228.16, '2026-06-12', 'futura'),
('1a788eb6-dee7-421f-986a-5b6485be2186', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 9228.16, '2026-07-10', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'bf637c6a-a939-4e57-9563-9ef941b31303';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('bf637c6a-a939-4e57-9563-9ef941b31303', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 13069.01, '2026-05-15', 'futura'),
('bf637c6a-a939-4e57-9563-9ef941b31303', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 13069.01, '2026-06-12', 'futura'),
('bf637c6a-a939-4e57-9563-9ef941b31303', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 13069.02, '2026-07-10', 'futura');
DELETE FROM parcelas WHERE pedido_id = '66dbaff9-c08d-4624-8969-2085ed9772d9';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('66dbaff9-c08d-4624-8969-2085ed9772d9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 96, '2026-06-02', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'db0d651e-2b7c-4065-a56b-0603f4c38ce4';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('db0d651e-2b7c-4065-a56b-0603f4c38ce4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 312, '2026-06-02', 'futura');
DELETE FROM parcelas WHERE pedido_id = '8e361387-1e77-478b-876e-97afbfed8620';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('8e361387-1e77-478b-876e-97afbfed8620', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 832, '2026-06-02', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c369d27e-4c3f-4ec0-becc-77f6d8b9da42';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c369d27e-4c3f-4ec0-becc-77f6d8b9da42', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 286.4, '2026-06-02', 'futura');
DELETE FROM parcelas WHERE pedido_id = '3cf5ffc1-3533-425d-a44b-d5d8f6f4fc91';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('3cf5ffc1-3533-425d-a44b-d5d8f6f4fc91', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 15464.53, '2026-05-15', 'futura'),
('3cf5ffc1-3533-425d-a44b-d5d8f6f4fc91', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 15464.53, '2026-06-12', 'futura'),
('3cf5ffc1-3533-425d-a44b-d5d8f6f4fc91', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 15464.54, '2026-07-10', 'futura');
DELETE FROM parcelas WHERE pedido_id = '809d12a1-8b39-4f69-8c22-5385666fc750';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('809d12a1-8b39-4f69-8c22-5385666fc750', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 640, '2026-04-06', 'futura'),
('809d12a1-8b39-4f69-8c22-5385666fc750', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 640, '2026-05-04', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'f0e8e37c-664b-4287-ab74-849677e90d28';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('f0e8e37c-664b-4287-ab74-849677e90d28', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 488, '2026-04-06', 'futura'),
('f0e8e37c-664b-4287-ab74-849677e90d28', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 488, '2026-05-04', 'futura');
DELETE FROM parcelas WHERE pedido_id = '454b9f25-55fb-4e60-8d75-4d9f1ea26022';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('454b9f25-55fb-4e60-8d75-4d9f1ea26022', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 4595.41, '2026-05-15', 'futura'),
('454b9f25-55fb-4e60-8d75-4d9f1ea26022', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 4595.41, '2026-06-12', 'futura'),
('454b9f25-55fb-4e60-8d75-4d9f1ea26022', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 4595.42, '2026-07-10', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'b73afb17-9b48-44bb-945a-c6aa2fd154df';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('b73afb17-9b48-44bb-945a-c6aa2fd154df', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2314.66, '2026-05-15', 'futura'),
('b73afb17-9b48-44bb-945a-c6aa2fd154df', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2314.66, '2026-06-12', 'futura'),
('b73afb17-9b48-44bb-945a-c6aa2fd154df', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2314.68, '2026-07-10', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c16943ab-39cc-4146-b33c-a08f8e957533';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c16943ab-39cc-4146-b33c-a08f8e957533', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2516.8, '2026-05-15', 'futura'),
('c16943ab-39cc-4146-b33c-a08f8e957533', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2516.8, '2026-06-12', 'futura'),
('c16943ab-39cc-4146-b33c-a08f8e957533', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2516.8, '2026-07-10', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'b4e87856-5eef-48ae-9fc9-cf038cbabfab';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('b4e87856-5eef-48ae-9fc9-cf038cbabfab', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 812.8, '2026-05-15', 'futura');
DELETE FROM parcelas WHERE pedido_id = '632b1140-25a2-4be8-8a87-62a7bf4ac3ec';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('632b1140-25a2-4be8-8a87-62a7bf4ac3ec', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 192, '2026-06-01', 'futura');
DELETE FROM parcelas WHERE pedido_id = '4994a222-5783-4e7d-bd82-ae2265df61ad';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('4994a222-5783-4e7d-bd82-ae2265df61ad', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 624, '2026-06-01', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ae17b935-c8b2-4e34-a877-d88503998282';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ae17b935-c8b2-4e34-a877-d88503998282', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1440, '2026-05-15', 'futura');
DELETE FROM parcelas WHERE pedido_id = '56192d49-1aab-4d60-b27b-251b45a3db85';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('56192d49-1aab-4d60-b27b-251b45a3db85', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 572.8, '2026-06-01', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ac6de8fb-0673-4963-b9d9-9d687bfd6f9b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ac6de8fb-0673-4963-b9d9-9d687bfd6f9b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1200, '2026-04-17', 'futura');
DELETE FROM parcelas WHERE pedido_id = '03192f3f-b4c1-452d-9842-16a5a1a615ca';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('03192f3f-b4c1-452d-9842-16a5a1a615ca', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2429.75, '2026-05-11', 'futura'),
('03192f3f-b4c1-452d-9842-16a5a1a615ca', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2429.75, '2026-06-08', 'futura'),
('03192f3f-b4c1-452d-9842-16a5a1a615ca', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2429.75, '2026-07-06', 'futura');
DELETE FROM parcelas WHERE pedido_id = '7e44608d-a582-4722-ba98-79d46f7005c5';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('7e44608d-a582-4722-ba98-79d46f7005c5', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 554.66, '2026-05-07', 'futura'),
('7e44608d-a582-4722-ba98-79d46f7005c5', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 554.66, '2026-05-21', 'futura'),
('7e44608d-a582-4722-ba98-79d46f7005c5', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 554.68, '2026-06-04', 'futura');
DELETE FROM parcelas WHERE pedido_id = '294eee89-be74-40bd-bf4c-7d9e86c5f8ea';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('294eee89-be74-40bd-bf4c-7d9e86c5f8ea', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 197.12, '2026-05-07', 'futura'),
('294eee89-be74-40bd-bf4c-7d9e86c5f8ea', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 197.12, '2026-05-21', 'futura'),
('294eee89-be74-40bd-bf4c-7d9e86c5f8ea', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 197.12, '2026-06-04', 'futura');
DELETE FROM parcelas WHERE pedido_id = '47b2e222-a8e3-47e1-9146-5c138070f336';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('47b2e222-a8e3-47e1-9146-5c138070f336', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 67.2, '2026-05-28', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'f6a89e5b-bc1b-4691-becf-a82ad475d4e7';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('f6a89e5b-bc1b-4691-becf-a82ad475d4e7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 4414.96, '2026-05-11', 'futura'),
('f6a89e5b-bc1b-4691-becf-a82ad475d4e7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 4414.96, '2026-06-08', 'futura'),
('f6a89e5b-bc1b-4691-becf-a82ad475d4e7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 4414.96, '2026-07-06', 'futura');
DELETE FROM parcelas WHERE pedido_id = '140907f3-1fd1-4272-a702-3f1f1e0bfea0';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('140907f3-1fd1-4272-a702-3f1f1e0bfea0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 920, '2026-05-11', 'futura'),
('140907f3-1fd1-4272-a702-3f1f1e0bfea0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 920, '2026-05-25', 'futura'),
('140907f3-1fd1-4272-a702-3f1f1e0bfea0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 920, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ae8e5312-9fd5-47cb-8612-84eca2f35163';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ae8e5312-9fd5-47cb-8612-84eca2f35163', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 429.33, '2026-05-11', 'futura'),
('ae8e5312-9fd5-47cb-8612-84eca2f35163', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 429.33, '2026-05-25', 'futura'),
('ae8e5312-9fd5-47cb-8612-84eca2f35163', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 429.34, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ac072dd1-d5a1-4b48-ac51-49e8b5c05a01';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ac072dd1-d5a1-4b48-ac51-49e8b5c05a01', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 201.6, '2026-05-28', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'd1e7f214-923a-4d2a-a4ef-50aa48c34785';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('d1e7f214-923a-4d2a-a4ef-50aa48c34785', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 21120, '2026-05-06', 'futura');
DELETE FROM parcelas WHERE pedido_id = '0f4d010c-c423-4386-afe4-94d310925b77';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('0f4d010c-c423-4386-afe4-94d310925b77', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1440, '2026-06-03', 'futura');
DELETE FROM parcelas WHERE pedido_id = '5a771a03-95f6-4caa-9766-a683ca402bf4';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('5a771a03-95f6-4caa-9766-a683ca402bf4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 422.4, '2026-06-05', 'futura'),
('5a771a03-95f6-4caa-9766-a683ca402bf4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 422.4, '2026-07-06', 'futura');
DELETE FROM parcelas WHERE pedido_id = '400eb6da-97c9-4cdb-b8c6-ab755e4c43cb';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('400eb6da-97c9-4cdb-b8c6-ab755e4c43cb', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 448, '2026-06-19', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'df8de5ba-508b-441d-8499-8ebc519a68db';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('df8de5ba-508b-441d-8499-8ebc519a68db', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1088, '2026-06-19', 'futura');
DELETE FROM parcelas WHERE pedido_id = '265e1fff-f98f-4afb-8fc6-fc35b9346584';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('265e1fff-f98f-4afb-8fc6-fc35b9346584', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 63.36, '2026-06-05', 'futura'),
('265e1fff-f98f-4afb-8fc6-fc35b9346584', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 63.36, '2026-07-06', 'futura');
DELETE FROM parcelas WHERE pedido_id = '961c2a25-f043-4a7c-bdf0-802997b1c469';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('961c2a25-f043-4a7c-bdf0-802997b1c469', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 6933.33, '2026-06-29', 'futura'),
('961c2a25-f043-4a7c-bdf0-802997b1c469', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 6933.33, '2026-07-13', 'futura'),
('961c2a25-f043-4a7c-bdf0-802997b1c469', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 6933.34, '2026-07-27', 'futura');
DELETE FROM parcelas WHERE pedido_id = '3d1f5df2-d4d5-46e2-9b03-a037eccd1037';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('3d1f5df2-d4d5-46e2-9b03-a037eccd1037', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2278.4, '2026-07-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = '349d3ee1-4ca0-4d13-bb36-4d3db6198c47';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('349d3ee1-4ca0-4d13-bb36-4d3db6198c47', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 8508.79, '2026-07-01', 'futura'),
('349d3ee1-4ca0-4d13-bb36-4d3db6198c47', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 8508.81, '2026-07-31', 'futura');
DELETE FROM parcelas WHERE pedido_id = '202b6faa-9310-4138-9f8b-70625a8a3ffa';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('202b6faa-9310-4138-9f8b-70625a8a3ffa', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 832, '2026-07-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = '57b21038-a869-44c8-b164-3560eb624dd7';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('57b21038-a869-44c8-b164-3560eb624dd7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 89.6, '2026-07-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = '55ce423f-940e-446a-af98-7c5f771215f6';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('55ce423f-940e-446a-af98-7c5f771215f6', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 591.36, '2026-07-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = '49aa5518-70d5-4e64-8b2f-6c6fafb550a4';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('49aa5518-70d5-4e64-8b2f-6c6fafb550a4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 224, '2026-07-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'b91e9d83-f06c-4f4e-bafc-c97c11023969';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('b91e9d83-f06c-4f4e-bafc-c97c11023969', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1164.8, '2026-07-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = '48c650c5-85f0-44b6-a91b-7fdf79d56d81';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('48c650c5-85f0-44b6-a91b-7fdf79d56d81', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 192, '2026-07-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = '78aa8631-3dff-403a-880a-b60efa11ee5e';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('78aa8631-3dff-403a-880a-b60efa11ee5e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 6346.66, '2026-06-29', 'futura'),
('78aa8631-3dff-403a-880a-b60efa11ee5e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 6346.66, '2026-07-13', 'futura'),
('78aa8631-3dff-403a-880a-b60efa11ee5e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 6346.68, '2026-07-27', 'futura');
DELETE FROM parcelas WHERE pedido_id = '7a10e17c-5ccd-4ecc-9cfd-cea73fb7cea7';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('7a10e17c-5ccd-4ecc-9cfd-cea73fb7cea7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 3584, '2026-05-21', 'futura'),
('7a10e17c-5ccd-4ecc-9cfd-cea73fb7cea7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 3584, '2026-06-05', 'futura'),
('7a10e17c-5ccd-4ecc-9cfd-cea73fb7cea7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 3584, '2026-06-19', 'futura'),
('7a10e17c-5ccd-4ecc-9cfd-cea73fb7cea7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 4, 3584, '2026-07-06', 'futura'),
('7a10e17c-5ccd-4ecc-9cfd-cea73fb7cea7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 5, 3584, '2026-07-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ea432644-efa9-4573-9857-8cefd93dcdcf';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ea432644-efa9-4573-9857-8cefd93dcdcf', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2328, '2026-05-28', 'futura');
DELETE FROM parcelas WHERE pedido_id = '17b995ab-4552-4965-90e2-7d6d1f6e194b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('17b995ab-4552-4965-90e2-7d6d1f6e194b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 65.24, '2026-05-21', 'futura'),
('17b995ab-4552-4965-90e2-7d6d1f6e194b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 65.24, '2026-06-05', 'futura'),
('17b995ab-4552-4965-90e2-7d6d1f6e194b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 65.24, '2026-06-19', 'futura'),
('17b995ab-4552-4965-90e2-7d6d1f6e194b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 4, 65.24, '2026-07-06', 'futura'),
('17b995ab-4552-4965-90e2-7d6d1f6e194b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 5, 65.28, '2026-07-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '20da32af-c696-447b-841b-500f1d910f2e';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('20da32af-c696-447b-841b-500f1d910f2e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 23.65, '2026-05-21', 'futura'),
('20da32af-c696-447b-841b-500f1d910f2e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 23.65, '2026-06-05', 'futura'),
('20da32af-c696-447b-841b-500f1d910f2e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 23.65, '2026-06-19', 'futura'),
('20da32af-c696-447b-841b-500f1d910f2e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 4, 23.65, '2026-07-06', 'futura'),
('20da32af-c696-447b-841b-500f1d910f2e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 5, 23.67, '2026-07-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ad4dc9df-7ae6-437a-aade-257728f6b82c';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ad4dc9df-7ae6-437a-aade-257728f6b82c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 7.02, '2026-05-21', 'futura'),
('ad4dc9df-7ae6-437a-aade-257728f6b82c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 7.02, '2026-06-05', 'futura'),
('ad4dc9df-7ae6-437a-aade-257728f6b82c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 7.02, '2026-06-19', 'futura'),
('ad4dc9df-7ae6-437a-aade-257728f6b82c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 4, 7.02, '2026-07-06', 'futura'),
('ad4dc9df-7ae6-437a-aade-257728f6b82c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 5, 7.06, '2026-07-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '9f3e5862-c510-4dff-a41e-cb96bb46c6e3';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('9f3e5862-c510-4dff-a41e-cb96bb46c6e3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 232.96, '2026-05-21', 'futura'),
('9f3e5862-c510-4dff-a41e-cb96bb46c6e3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 232.96, '2026-06-05', 'futura'),
('9f3e5862-c510-4dff-a41e-cb96bb46c6e3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 232.96, '2026-06-19', 'futura'),
('9f3e5862-c510-4dff-a41e-cb96bb46c6e3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 4, 232.96, '2026-07-06', 'futura'),
('9f3e5862-c510-4dff-a41e-cb96bb46c6e3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 5, 232.96, '2026-07-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '5f174711-d6f3-4a5d-8de7-bf74efe3b77c';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('5f174711-d6f3-4a5d-8de7-bf74efe3b77c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 21.92, '2026-05-21', 'futura'),
('5f174711-d6f3-4a5d-8de7-bf74efe3b77c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 21.92, '2026-06-05', 'futura'),
('5f174711-d6f3-4a5d-8de7-bf74efe3b77c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 21.92, '2026-06-19', 'futura'),
('5f174711-d6f3-4a5d-8de7-bf74efe3b77c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 4, 21.92, '2026-07-06', 'futura'),
('5f174711-d6f3-4a5d-8de7-bf74efe3b77c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 5, 21.92, '2026-07-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c8fb4c11-ac00-4d5c-8f7a-bc495e21e455';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c8fb4c11-ac00-4d5c-8f7a-bc495e21e455', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 844.8, '2026-06-29', 'futura'),
('c8fb4c11-ac00-4d5c-8f7a-bc495e21e455', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 844.8, '2026-07-27', 'futura'),
('c8fb4c11-ac00-4d5c-8f7a-bc495e21e455', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 844.8, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '0be2cfea-667c-4ee9-b518-6954214f6ec3';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('0be2cfea-667c-4ee9-b518-6954214f6ec3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 614.4, '2026-06-29', 'futura'),
('0be2cfea-667c-4ee9-b518-6954214f6ec3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 614.4, '2026-07-27', 'futura'),
('0be2cfea-667c-4ee9-b518-6954214f6ec3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 614.4, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '48534667-09ff-4e73-a157-38a7562c5e0b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('48534667-09ff-4e73-a157-38a7562c5e0b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 614.4, '2026-06-29', 'futura'),
('48534667-09ff-4e73-a157-38a7562c5e0b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 614.4, '2026-07-27', 'futura'),
('48534667-09ff-4e73-a157-38a7562c5e0b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 614.4, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '0fe7b0e5-01d6-4e94-bf1d-ea4b619c0e0c';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('0fe7b0e5-01d6-4e94-bf1d-ea4b619c0e0c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1856, '2026-06-29', 'futura'),
('0fe7b0e5-01d6-4e94-bf1d-ea4b619c0e0c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 1856, '2026-07-27', 'futura'),
('0fe7b0e5-01d6-4e94-bf1d-ea4b619c0e0c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 1856, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'f7e02907-e51f-4a1e-9cea-9568c5686f59';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('f7e02907-e51f-4a1e-9cea-9568c5686f59', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2474.66, '2026-06-29', 'futura'),
('f7e02907-e51f-4a1e-9cea-9568c5686f59', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2474.66, '2026-07-27', 'futura'),
('f7e02907-e51f-4a1e-9cea-9568c5686f59', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2474.68, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '2023037f-c04c-4086-af7a-5fce6cd42845';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('2023037f-c04c-4086-af7a-5fce6cd42845', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2474.66, '2026-06-29', 'futura'),
('2023037f-c04c-4086-af7a-5fce6cd42845', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2474.66, '2026-07-27', 'futura'),
('2023037f-c04c-4086-af7a-5fce6cd42845', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2474.68, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '21302609-c0bd-46c9-8d42-1cd2fe2398cb';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('21302609-c0bd-46c9-8d42-1cd2fe2398cb', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 551.04, '2026-06-29', 'futura'),
('21302609-c0bd-46c9-8d42-1cd2fe2398cb', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 551.04, '2026-07-27', 'futura'),
('21302609-c0bd-46c9-8d42-1cd2fe2398cb', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 551.04, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'd5448272-b153-4426-8203-6f4c6ea5eb81';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('d5448272-b153-4426-8203-6f4c6ea5eb81', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 551.04, '2026-06-29', 'futura'),
('d5448272-b153-4426-8203-6f4c6ea5eb81', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 551.04, '2026-07-27', 'futura'),
('d5448272-b153-4426-8203-6f4c6ea5eb81', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 551.04, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '67159363-c510-4e69-8667-0a84aabd01a9';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('67159363-c510-4e69-8667-0a84aabd01a9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 551.04, '2026-06-29', 'futura'),
('67159363-c510-4e69-8667-0a84aabd01a9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 551.04, '2026-07-27', 'futura'),
('67159363-c510-4e69-8667-0a84aabd01a9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 551.04, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '0cffd91e-61bb-403e-9fe1-4b8423228b26';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('0cffd91e-61bb-403e-9fe1-4b8423228b26', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1785.6, '2026-06-29', 'futura'),
('0cffd91e-61bb-403e-9fe1-4b8423228b26', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 1785.6, '2026-07-27', 'futura'),
('0cffd91e-61bb-403e-9fe1-4b8423228b26', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 1785.6, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '4f464337-1015-4558-9694-faefe018dae1';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('4f464337-1015-4558-9694-faefe018dae1', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1785.6, '2026-06-29', 'futura'),
('4f464337-1015-4558-9694-faefe018dae1', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 1785.6, '2026-07-27', 'futura'),
('4f464337-1015-4558-9694-faefe018dae1', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 1785.6, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'd7355195-4512-45d5-b527-53dd5eaf6b5b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('d7355195-4512-45d5-b527-53dd5eaf6b5b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1785.6, '2026-06-29', 'futura'),
('d7355195-4512-45d5-b527-53dd5eaf6b5b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 1785.6, '2026-07-27', 'futura'),
('d7355195-4512-45d5-b527-53dd5eaf6b5b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 1785.6, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '19d48466-b761-45e8-a55c-972ff432606b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('19d48466-b761-45e8-a55c-972ff432606b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 373.33, '2026-06-29', 'futura'),
('19d48466-b761-45e8-a55c-972ff432606b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 373.33, '2026-07-27', 'futura'),
('19d48466-b761-45e8-a55c-972ff432606b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 373.34, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '179a678e-bd49-4770-9d66-7637b635c81d';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('179a678e-bd49-4770-9d66-7637b635c81d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 93.65, '2026-06-29', 'futura'),
('179a678e-bd49-4770-9d66-7637b635c81d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 93.65, '2026-07-27', 'futura'),
('179a678e-bd49-4770-9d66-7637b635c81d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 93.66, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '7c7492bb-fd83-496b-aacd-d7c215ab5c63';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('7c7492bb-fd83-496b-aacd-d7c215ab5c63', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 237.44, '2026-06-29', 'futura'),
('7c7492bb-fd83-496b-aacd-d7c215ab5c63', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 237.44, '2026-07-27', 'futura'),
('7c7492bb-fd83-496b-aacd-d7c215ab5c63', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 237.44, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '9a97ac0f-57fc-467f-ad52-0086f9b3c7e3';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('9a97ac0f-57fc-467f-ad52-0086f9b3c7e3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 316.58, '2026-06-29', 'futura'),
('9a97ac0f-57fc-467f-ad52-0086f9b3c7e3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 316.58, '2026-07-27', 'futura'),
('9a97ac0f-57fc-467f-ad52-0086f9b3c7e3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 316.6, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '042eac38-e019-4c1c-b776-2cea4ef57be1';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('042eac38-e019-4c1c-b776-2cea4ef57be1', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 479.36, '2026-06-29', 'futura'),
('042eac38-e019-4c1c-b776-2cea4ef57be1', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 479.36, '2026-07-27', 'futura'),
('042eac38-e019-4c1c-b776-2cea4ef57be1', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 479.36, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '889ffd4b-4138-4fb6-9a6c-d3f17983e0df';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('889ffd4b-4138-4fb6-9a6c-d3f17983e0df', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 79.89, '2026-06-29', 'futura'),
('889ffd4b-4138-4fb6-9a6c-d3f17983e0df', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 79.89, '2026-07-27', 'futura'),
('889ffd4b-4138-4fb6-9a6c-d3f17983e0df', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 79.9, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '4bd319b9-2dbf-41cd-b0ba-1ba32ec4b243';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('4bd319b9-2dbf-41cd-b0ba-1ba32ec4b243', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 99.52, '2026-06-29', 'futura'),
('4bd319b9-2dbf-41cd-b0ba-1ba32ec4b243', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 99.52, '2026-07-27', 'futura'),
('4bd319b9-2dbf-41cd-b0ba-1ba32ec4b243', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 99.52, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ceafbe18-16a2-4b5d-ae0e-a382ede5fecb';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ceafbe18-16a2-4b5d-ae0e-a382ede5fecb', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2558.93, '2026-06-29', 'futura'),
('ceafbe18-16a2-4b5d-ae0e-a382ede5fecb', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2558.93, '2026-07-27', 'futura'),
('ceafbe18-16a2-4b5d-ae0e-a382ede5fecb', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2558.94, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a7acdc81-0163-40a5-bdd0-f0704b9e3d79';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a7acdc81-0163-40a5-bdd0-f0704b9e3d79', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2.56, '2026-06-29', 'futura'),
('a7acdc81-0163-40a5-bdd0-f0704b9e3d79', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2.56, '2026-07-27', 'futura'),
('a7acdc81-0163-40a5-bdd0-f0704b9e3d79', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2.56, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '42da8dcf-7fbc-447c-913a-477b358246d9';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('42da8dcf-7fbc-447c-913a-477b358246d9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 9.6, '2026-06-29', 'futura'),
('42da8dcf-7fbc-447c-913a-477b358246d9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 9.6, '2026-07-27', 'futura'),
('42da8dcf-7fbc-447c-913a-477b358246d9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 9.6, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '4f66f703-bd8c-46fe-b92a-cd842870d77c';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('4f66f703-bd8c-46fe-b92a-cd842870d77c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 8.32, '2026-06-29', 'futura'),
('4f66f703-bd8c-46fe-b92a-cd842870d77c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 8.32, '2026-07-27', 'futura'),
('4f66f703-bd8c-46fe-b92a-cd842870d77c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 8.32, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'e02196ee-74bd-4a57-9c5d-5a959d4314ce';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('e02196ee-74bd-4a57-9c5d-5a959d4314ce', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 8, '2026-06-29', 'futura'),
('e02196ee-74bd-4a57-9c5d-5a959d4314ce', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 8, '2026-07-27', 'futura'),
('e02196ee-74bd-4a57-9c5d-5a959d4314ce', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 8, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '2972b698-200c-482b-913c-4d8fb5589597';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('2972b698-200c-482b-913c-4d8fb5589597', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 93.65, '2026-06-29', 'futura'),
('2972b698-200c-482b-913c-4d8fb5589597', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 93.65, '2026-07-27', 'futura'),
('2972b698-200c-482b-913c-4d8fb5589597', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 93.66, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '0a44379c-2f7c-45b7-9e24-6c1c6a55c461';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('0a44379c-2f7c-45b7-9e24-6c1c6a55c461', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 259.62, '2026-06-29', 'futura'),
('0a44379c-2f7c-45b7-9e24-6c1c6a55c461', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 259.62, '2026-07-27', 'futura'),
('0a44379c-2f7c-45b7-9e24-6c1c6a55c461', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 259.64, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c7b28a40-9a07-4c44-8220-bdae2bd1b3c7';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c7b28a40-9a07-4c44-8220-bdae2bd1b3c7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 257.7, '2026-06-29', 'futura'),
('c7b28a40-9a07-4c44-8220-bdae2bd1b3c7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 257.7, '2026-07-27', 'futura'),
('c7b28a40-9a07-4c44-8220-bdae2bd1b3c7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 257.72, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'f3da87e3-4743-4c69-993d-60ae2b2c1461';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('f3da87e3-4743-4c69-993d-60ae2b2c1461', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 157.33, '2026-06-29', 'futura'),
('f3da87e3-4743-4c69-993d-60ae2b2c1461', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 157.33, '2026-07-27', 'futura'),
('f3da87e3-4743-4c69-993d-60ae2b2c1461', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 157.34, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'f6bfbd67-8392-473f-94ba-d97a9961f9c0';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('f6bfbd67-8392-473f-94ba-d97a9961f9c0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 107.52, '2026-06-29', 'futura'),
('f6bfbd67-8392-473f-94ba-d97a9961f9c0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 107.52, '2026-07-27', 'futura'),
('f6bfbd67-8392-473f-94ba-d97a9961f9c0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 107.52, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '7b074424-265d-478b-a684-04cdcafc1b36';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('7b074424-265d-478b-a684-04cdcafc1b36', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 967.68, '2026-06-29', 'futura'),
('7b074424-265d-478b-a684-04cdcafc1b36', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 967.68, '2026-07-27', 'futura'),
('7b074424-265d-478b-a684-04cdcafc1b36', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 967.68, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '75a14292-4544-4d39-8e2c-1f03efec79e9';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('75a14292-4544-4d39-8e2c-1f03efec79e9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 215.04, '2026-06-29', 'futura'),
('75a14292-4544-4d39-8e2c-1f03efec79e9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 215.04, '2026-07-27', 'futura'),
('75a14292-4544-4d39-8e2c-1f03efec79e9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 215.04, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '20417930-141e-4f70-8be4-865ddd981096';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('20417930-141e-4f70-8be4-865ddd981096', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 103.25, '2026-06-29', 'futura'),
('20417930-141e-4f70-8be4-865ddd981096', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 103.25, '2026-07-27', 'futura'),
('20417930-141e-4f70-8be4-865ddd981096', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 103.26, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '3b3f67f0-70a1-4073-8ef4-2373a31cd757';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('3b3f67f0-70a1-4073-8ef4-2373a31cd757', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 100.9, '2026-06-29', 'futura'),
('3b3f67f0-70a1-4073-8ef4-2373a31cd757', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 100.9, '2026-07-27', 'futura'),
('3b3f67f0-70a1-4073-8ef4-2373a31cd757', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 100.92, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '2ac9b70b-001c-45c5-add1-588e404c0bc4';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('2ac9b70b-001c-45c5-add1-588e404c0bc4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 432.85, '2026-06-29', 'futura'),
('2ac9b70b-001c-45c5-add1-588e404c0bc4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 432.85, '2026-07-27', 'futura'),
('2ac9b70b-001c-45c5-add1-588e404c0bc4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 432.86, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a2e11e94-495c-42aa-bd09-3a4f325992f2';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a2e11e94-495c-42aa-bd09-3a4f325992f2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 277.33, '2026-06-29', 'futura'),
('a2e11e94-495c-42aa-bd09-3a4f325992f2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 277.33, '2026-07-27', 'futura'),
('a2e11e94-495c-42aa-bd09-3a4f325992f2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 277.34, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'cd4a6ae2-1e57-4176-b77a-db938aafcfca';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('cd4a6ae2-1e57-4176-b77a-db938aafcfca', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 208.21, '2026-06-29', 'futura'),
('cd4a6ae2-1e57-4176-b77a-db938aafcfca', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 208.21, '2026-07-27', 'futura'),
('cd4a6ae2-1e57-4176-b77a-db938aafcfca', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 208.22, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '597f397f-2a01-420f-a032-ee9cab9e6902';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('597f397f-2a01-420f-a032-ee9cab9e6902', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 525.54, '2026-06-29', 'futura'),
('597f397f-2a01-420f-a032-ee9cab9e6902', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 525.54, '2026-07-27', 'futura'),
('597f397f-2a01-420f-a032-ee9cab9e6902', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 525.56, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ea6ecbaa-a3fb-4da9-974c-52bbdfbf2c4e';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ea6ecbaa-a3fb-4da9-974c-52bbdfbf2c4e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 109.76, '2026-06-29', 'futura'),
('ea6ecbaa-a3fb-4da9-974c-52bbdfbf2c4e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 109.76, '2026-07-27', 'futura'),
('ea6ecbaa-a3fb-4da9-974c-52bbdfbf2c4e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 109.76, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'e0d4f07f-d834-454e-a893-2f6a7b9f4474';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('e0d4f07f-d834-454e-a893-2f6a7b9f4474', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 56.96, '2026-06-29', 'futura'),
('e0d4f07f-d834-454e-a893-2f6a7b9f4474', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 56.96, '2026-07-27', 'futura'),
('e0d4f07f-d834-454e-a893-2f6a7b9f4474', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 56.96, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'e9690e68-177e-42c0-866b-fd7faadfa988';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('e9690e68-177e-42c0-866b-fd7faadfa988', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2047.14, '2026-06-29', 'futura'),
('e9690e68-177e-42c0-866b-fd7faadfa988', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2047.14, '2026-07-27', 'futura'),
('e9690e68-177e-42c0-866b-fd7faadfa988', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2047.16, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '4a05633f-15cc-4c61-a112-fb20c1d58df3';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('4a05633f-15cc-4c61-a112-fb20c1d58df3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 73.6, '2026-06-29', 'futura'),
('4a05633f-15cc-4c61-a112-fb20c1d58df3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 73.6, '2026-07-27', 'futura'),
('4a05633f-15cc-4c61-a112-fb20c1d58df3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 73.6, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c1ec6137-f398-4476-b41b-aeb66b4327f8';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c1ec6137-f398-4476-b41b-aeb66b4327f8', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 5013.33, '2026-06-29', 'futura'),
('c1ec6137-f398-4476-b41b-aeb66b4327f8', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 5013.33, '2026-07-27', 'futura'),
('c1ec6137-f398-4476-b41b-aeb66b4327f8', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 5013.34, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '9caa7a38-7106-41e8-b44b-891cf2c36d23';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('9caa7a38-7106-41e8-b44b-891cf2c36d23', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 260.9, '2026-06-29', 'futura'),
('9caa7a38-7106-41e8-b44b-891cf2c36d23', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 260.9, '2026-07-27', 'futura'),
('9caa7a38-7106-41e8-b44b-891cf2c36d23', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 260.92, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '51d1c13f-29a7-4640-a3c9-36ca5345258d';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('51d1c13f-29a7-4640-a3c9-36ca5345258d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2442.66, '2026-06-29', 'futura'),
('51d1c13f-29a7-4640-a3c9-36ca5345258d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2442.66, '2026-07-27', 'futura'),
('51d1c13f-29a7-4640-a3c9-36ca5345258d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2442.68, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '38c759d9-52c3-4fb5-96fc-241d401abfbd';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('38c759d9-52c3-4fb5-96fc-241d401abfbd', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 316.16, '2026-06-29', 'futura'),
('38c759d9-52c3-4fb5-96fc-241d401abfbd', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 316.16, '2026-07-27', 'futura'),
('38c759d9-52c3-4fb5-96fc-241d401abfbd', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 316.16, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '2e785643-9b94-4608-bd87-94aca86ae44d';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('2e785643-9b94-4608-bd87-94aca86ae44d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 20.58, '2026-06-29', 'futura'),
('2e785643-9b94-4608-bd87-94aca86ae44d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 20.58, '2026-07-27', 'futura'),
('2e785643-9b94-4608-bd87-94aca86ae44d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 20.6, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '157e4169-fb29-44ca-8bea-c4d34c7a7279';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('157e4169-fb29-44ca-8bea-c4d34c7a7279', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 196.8, '2026-06-29', 'futura'),
('157e4169-fb29-44ca-8bea-c4d34c7a7279', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 196.8, '2026-07-27', 'futura'),
('157e4169-fb29-44ca-8bea-c4d34c7a7279', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 196.8, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '410fe9f9-f5ed-422d-90ed-370a879eabbc';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('410fe9f9-f5ed-422d-90ed-370a879eabbc', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2186.66, '2026-06-29', 'futura'),
('410fe9f9-f5ed-422d-90ed-370a879eabbc', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2186.66, '2026-07-27', 'futura'),
('410fe9f9-f5ed-422d-90ed-370a879eabbc', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2186.68, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'b011d939-066b-4536-83cc-46e16d31129f';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('b011d939-066b-4536-83cc-46e16d31129f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 300.8, '2026-06-29', 'futura'),
('b011d939-066b-4536-83cc-46e16d31129f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 300.8, '2026-07-27', 'futura'),
('b011d939-066b-4536-83cc-46e16d31129f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 300.8, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '326babf9-acf4-467a-b233-26734e363c4e';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('326babf9-acf4-467a-b233-26734e363c4e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 39.25, '2026-06-29', 'futura'),
('326babf9-acf4-467a-b233-26734e363c4e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 39.25, '2026-07-27', 'futura'),
('326babf9-acf4-467a-b233-26734e363c4e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 39.26, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '36f581b3-4926-4e91-aff0-0b5fe24d2ea8';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('36f581b3-4926-4e91-aff0-0b5fe24d2ea8', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 12.8, '2026-06-29', 'futura'),
('36f581b3-4926-4e91-aff0-0b5fe24d2ea8', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 12.8, '2026-07-27', 'futura'),
('36f581b3-4926-4e91-aff0-0b5fe24d2ea8', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 12.8, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a8f7d22c-162e-426b-83a4-3825d5ade429';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a8f7d22c-162e-426b-83a4-3825d5ade429', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 130.34, '2026-06-29', 'futura'),
('a8f7d22c-162e-426b-83a4-3825d5ade429', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 130.34, '2026-07-27', 'futura'),
('a8f7d22c-162e-426b-83a4-3825d5ade429', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 130.36, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '091c9b5d-c507-48fb-bf64-4033b6ae6575';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('091c9b5d-c507-48fb-bf64-4033b6ae6575', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 159.68, '2026-06-29', 'futura'),
('091c9b5d-c507-48fb-bf64-4033b6ae6575', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 159.68, '2026-07-27', 'futura'),
('091c9b5d-c507-48fb-bf64-4033b6ae6575', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 159.68, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '16829d1e-d1a5-4377-a8aa-198cb447b2b4';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('16829d1e-d1a5-4377-a8aa-198cb447b2b4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 257.28, '2026-06-29', 'futura'),
('16829d1e-d1a5-4377-a8aa-198cb447b2b4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 257.28, '2026-07-27', 'futura'),
('16829d1e-d1a5-4377-a8aa-198cb447b2b4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 257.28, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '643176c6-ea0a-41d9-a413-93dcc35cdf47';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('643176c6-ea0a-41d9-a413-93dcc35cdf47', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 48, '2026-06-29', 'futura'),
('643176c6-ea0a-41d9-a413-93dcc35cdf47', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 48, '2026-07-27', 'futura'),
('643176c6-ea0a-41d9-a413-93dcc35cdf47', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 48, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'f19f5a2f-2057-48e0-82da-f7dcf226fc5f';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('f19f5a2f-2057-48e0-82da-f7dcf226fc5f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 7466.66, '2026-06-29', 'futura'),
('f19f5a2f-2057-48e0-82da-f7dcf226fc5f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 7466.66, '2026-07-27', 'futura'),
('f19f5a2f-2057-48e0-82da-f7dcf226fc5f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 7466.68, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '661bf712-066d-44a9-b727-287ec43ad872';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('661bf712-066d-44a9-b727-287ec43ad872', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 771.73, '2026-06-29', 'futura'),
('661bf712-066d-44a9-b727-287ec43ad872', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 771.73, '2026-07-27', 'futura'),
('661bf712-066d-44a9-b727-287ec43ad872', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 771.74, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'b6c39952-cf30-45dd-94ea-e72786008585';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('b6c39952-cf30-45dd-94ea-e72786008585', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1229.86, '2026-06-29', 'futura'),
('b6c39952-cf30-45dd-94ea-e72786008585', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 1229.86, '2026-07-27', 'futura'),
('b6c39952-cf30-45dd-94ea-e72786008585', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 1229.88, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '371eab19-885c-4bbe-b32b-0db80de878ce';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('371eab19-885c-4bbe-b32b-0db80de878ce', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 114.88, '2026-06-29', 'futura'),
('371eab19-885c-4bbe-b32b-0db80de878ce', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 114.88, '2026-07-27', 'futura'),
('371eab19-885c-4bbe-b32b-0db80de878ce', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 114.88, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'da1dd1ce-2689-462d-b9d1-cda9bf976753';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('da1dd1ce-2689-462d-b9d1-cda9bf976753', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 74.66, '2026-06-29', 'futura'),
('da1dd1ce-2689-462d-b9d1-cda9bf976753', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 74.66, '2026-07-27', 'futura'),
('da1dd1ce-2689-462d-b9d1-cda9bf976753', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 74.68, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '42545cfb-833c-4917-94d4-88c868bd8daa';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('42545cfb-833c-4917-94d4-88c868bd8daa', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 650.66, '2026-06-29', 'futura'),
('42545cfb-833c-4917-94d4-88c868bd8daa', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 650.66, '2026-07-27', 'futura'),
('42545cfb-833c-4917-94d4-88c868bd8daa', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 650.68, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = '1c945902-c1be-416f-9081-7f858bdeaa55';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('1c945902-c1be-416f-9081-7f858bdeaa55', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 325.33, '2026-06-29', 'futura'),
('1c945902-c1be-416f-9081-7f858bdeaa55', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 325.33, '2026-07-27', 'futura'),
('1c945902-c1be-416f-9081-7f858bdeaa55', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 325.34, '2026-08-24', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c0580e8d-e61e-4c60-bcca-7128d4651820';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c0580e8d-e61e-4c60-bcca-7128d4651820', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1938.24, '2026-06-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a80e2343-9afb-4282-b38b-40c1839f7bdf';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a80e2343-9afb-4282-b38b-40c1839f7bdf', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 5575.68, '2026-07-21', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'b9700528-24a4-4e4f-83bf-982de6acf6d6';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('b9700528-24a4-4e4f-83bf-982de6acf6d6', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 128, '2026-07-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = '764a3a19-a326-4d6b-8285-273d03092022';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('764a3a19-a326-4d6b-8285-273d03092022', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1120, '2026-07-01', 'futura'),
('764a3a19-a326-4d6b-8285-273d03092022', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 1120, '2026-07-31', 'futura'),
('764a3a19-a326-4d6b-8285-273d03092022', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 1120, '2026-08-31', 'futura');
DELETE FROM parcelas WHERE pedido_id = '98fa87b3-a9e7-44a2-84eb-5328a636d187';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('98fa87b3-a9e7-44a2-84eb-5328a636d187', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 672, '2026-07-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = '9d39039f-8d4a-4c21-8ebd-e61c7d929a0d';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('9d39039f-8d4a-4c21-8ebd-e61c7d929a0d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 70.08, '2026-06-01', 'futura');
DELETE FROM parcelas WHERE pedido_id = '24ceb663-4e7d-4dc6-98a8-f37d1cdea56f';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('24ceb663-4e7d-4dc6-98a8-f37d1cdea56f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 476.8, '2026-06-01', 'futura');
DELETE FROM parcelas WHERE pedido_id = '46d985c2-f085-4ecd-b386-1f649550c356';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('46d985c2-f085-4ecd-b386-1f649550c356', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 40.8, '2026-06-01', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c07c5e66-5ec9-4a83-9f5f-e79497cc6b2f';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c07c5e66-5ec9-4a83-9f5f-e79497cc6b2f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 44.74, '2026-06-01', 'futura');
DELETE FROM parcelas WHERE pedido_id = '2efe4b25-763d-46f4-b859-2090e116d045';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('2efe4b25-763d-46f4-b859-2090e116d045', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 56, '2026-06-01', 'futura');
DELETE FROM parcelas WHERE pedido_id = '2aee70f8-6ac2-4db7-90f5-600477b041f7';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('2aee70f8-6ac2-4db7-90f5-600477b041f7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 142.4, '2026-06-01', 'futura');
DELETE FROM parcelas WHERE pedido_id = '6f033f74-ef6f-4ad4-a4aa-d092ed7796b1';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('6f033f74-ef6f-4ad4-a4aa-d092ed7796b1', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 56, '2026-06-01', 'futura');
DELETE FROM parcelas WHERE pedido_id = '17843553-0e12-47f5-8f1c-5246d6a4ebe9';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('17843553-0e12-47f5-8f1c-5246d6a4ebe9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 254.4, '2026-06-01', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ff3c408f-2261-489f-831e-5fcc7348c4dd';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ff3c408f-2261-489f-831e-5fcc7348c4dd', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 112, '2026-06-01', 'futura');
DELETE FROM parcelas WHERE pedido_id = '6b635264-76f0-4176-b3b2-8c070e40d396';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('6b635264-76f0-4176-b3b2-8c070e40d396', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 115.14, '2026-06-01', 'futura');
DELETE FROM parcelas WHERE pedido_id = '9389d73d-893c-4306-8cb8-08fefe9addb3';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('9389d73d-893c-4306-8cb8-08fefe9addb3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 89.6, '2026-06-01', 'futura');
DELETE FROM parcelas WHERE pedido_id = '1b74b226-18d0-4efc-aaec-c5010615ceff';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('1b74b226-18d0-4efc-aaec-c5010615ceff', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 5700, '2026-05-22', 'futura'),
('1b74b226-18d0-4efc-aaec-c5010615ceff', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 5700, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'd84c33f0-75db-47d7-99f2-e2718915b485';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('d84c33f0-75db-47d7-99f2-e2718915b485', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 500, '2026-05-22', 'futura'),
('d84c33f0-75db-47d7-99f2-e2718915b485', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 500, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '9c1a9ba4-5fcf-4791-a93a-adc111f6acd1';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('9c1a9ba4-5fcf-4791-a93a-adc111f6acd1', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 600, '2026-05-22', 'futura'),
('9c1a9ba4-5fcf-4791-a93a-adc111f6acd1', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 600, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '622fa57c-2f2b-4de2-b179-0b050b9fab56';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('622fa57c-2f2b-4de2-b179-0b050b9fab56', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1060.68, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = '98bcc3e3-4743-40e7-9c99-74e4edbe574c';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('98bcc3e3-4743-40e7-9c99-74e4edbe574c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 600, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = '968d9ab5-5694-4bdb-8945-93eeb9a521a5';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('968d9ab5-5694-4bdb-8945-93eeb9a521a5', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2000, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'd06898c4-97ab-44d7-8b94-651f108cdd81';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('d06898c4-97ab-44d7-8b94-651f108cdd81', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 4096, '2026-05-28', 'futura'),
('d06898c4-97ab-44d7-8b94-651f108cdd81', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 4096, '2026-06-25', 'futura'),
('d06898c4-97ab-44d7-8b94-651f108cdd81', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 4096, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ce758a87-5dcd-4ae8-9006-7628835d26e9';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ce758a87-5dcd-4ae8-9006-7628835d26e9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 10.13, '2026-05-28', 'futura'),
('ce758a87-5dcd-4ae8-9006-7628835d26e9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 10.13, '2026-06-25', 'futura'),
('ce758a87-5dcd-4ae8-9006-7628835d26e9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 10.14, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = '946dd379-cb70-4ced-a4dd-f6f2e502fa2b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('946dd379-cb70-4ced-a4dd-f6f2e502fa2b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 11.73, '2026-05-28', 'futura'),
('946dd379-cb70-4ced-a4dd-f6f2e502fa2b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 11.73, '2026-06-25', 'futura'),
('946dd379-cb70-4ced-a4dd-f6f2e502fa2b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 11.74, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c17ed9e6-7366-4894-9b1b-0a21d57aded7';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c17ed9e6-7366-4894-9b1b-0a21d57aded7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 10.13, '2026-05-28', 'futura'),
('c17ed9e6-7366-4894-9b1b-0a21d57aded7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 10.13, '2026-06-25', 'futura'),
('c17ed9e6-7366-4894-9b1b-0a21d57aded7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 10.14, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a708699a-6b2e-4185-814f-2c517d8e54e1';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a708699a-6b2e-4185-814f-2c517d8e54e1', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 285.69, '2026-05-28', 'futura'),
('a708699a-6b2e-4185-814f-2c517d8e54e1', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 285.69, '2026-06-25', 'futura'),
('a708699a-6b2e-4185-814f-2c517d8e54e1', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 285.69, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c23ceeef-a4d6-4fb2-afca-c8cb85e70ce0';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c23ceeef-a4d6-4fb2-afca-c8cb85e70ce0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 9980, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'd8e23e00-1449-49d8-be35-be2eb2a874f8';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('d8e23e00-1449-49d8-be35-be2eb2a874f8', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1856.19, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = '1576a837-9d8d-41ef-a463-a80c11427b4a';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('1576a837-9d8d-41ef-a463-a80c11427b4a', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1554, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'def0d68b-9ec9-45a3-88e7-fbb652eec0c4';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('def0d68b-9ec9-45a3-88e7-fbb652eec0c4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1072.22, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'e48511b7-11fe-47a1-9446-97a17e342516';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('e48511b7-11fe-47a1-9446-97a17e342516', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2226, '2026-05-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = '30ab79d5-66ca-4e6e-a282-2ac97bd8384b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('30ab79d5-66ca-4e6e-a282-2ac97bd8384b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 629.7, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = '0bc12a32-1ae4-49a4-8c67-3c2aa4bbe4b3';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('0bc12a32-1ae4-49a4-8c67-3c2aa4bbe4b3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 178.13, '2026-05-21', 'futura'),
('0bc12a32-1ae4-49a4-8c67-3c2aa4bbe4b3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 178.13, '2026-06-18', 'futura'),
('0bc12a32-1ae4-49a4-8c67-3c2aa4bbe4b3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 178.14, '2026-07-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = '12ab4950-12af-4343-9e42-3d9fb9194c81';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('12ab4950-12af-4343-9e42-3d9fb9194c81', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 328.06, '2026-05-21', 'futura'),
('12ab4950-12af-4343-9e42-3d9fb9194c81', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 328.06, '2026-06-18', 'futura'),
('12ab4950-12af-4343-9e42-3d9fb9194c81', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 328.07, '2026-07-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'e03a0e65-9be2-4613-a6a3-5ce3bfc4eb53';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('e03a0e65-9be2-4613-a6a3-5ce3bfc4eb53', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 132.26, '2026-05-21', 'futura'),
('e03a0e65-9be2-4613-a6a3-5ce3bfc4eb53', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 132.26, '2026-06-18', 'futura'),
('e03a0e65-9be2-4613-a6a3-5ce3bfc4eb53', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 132.28, '2026-07-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'd1e5bfcb-6b47-4406-9606-f81af7c8f9bd';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('d1e5bfcb-6b47-4406-9606-f81af7c8f9bd', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 938, '2026-04-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = '7d0aa826-97d6-4b6b-8402-a4701d5ae5bf';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('7d0aa826-97d6-4b6b-8402-a4701d5ae5bf', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1876, '2026-04-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c5907cfd-5761-4275-b495-5b68145df13d';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c5907cfd-5761-4275-b495-5b68145df13d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1876, '2026-04-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = '3f7de992-d10c-488f-924a-bb61afb1332d';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('3f7de992-d10c-488f-924a-bb61afb1332d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 459, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'dbe74179-3a70-4fa9-a4fd-2e0d70a049a0';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('dbe74179-3a70-4fa9-a4fd-2e0d70a049a0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 851.06, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = '4abadaab-a585-4e8c-8ff3-fe0975355aa6';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('4abadaab-a585-4e8c-8ff3-fe0975355aa6', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 967.6, '2026-05-21', 'futura');
DELETE FROM parcelas WHERE pedido_id = '9c36c666-0528-4c0e-bedb-34297b051394';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('9c36c666-0528-4c0e-bedb-34297b051394', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 200, '2026-04-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = '613f2e93-8107-44c3-b28b-6ea1bf82e705';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('613f2e93-8107-44c3-b28b-6ea1bf82e705', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1194.66, '2026-05-19', 'futura'),
('613f2e93-8107-44c3-b28b-6ea1bf82e705', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 1194.66, '2026-06-02', 'futura'),
('613f2e93-8107-44c3-b28b-6ea1bf82e705', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 1194.68, '2026-06-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'b99ffa7f-52c3-48cd-af61-0676fa4e4b60';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('b99ffa7f-52c3-48cd-af61-0676fa4e4b60', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 561.6, '2026-05-11', 'futura');
DELETE FROM parcelas WHERE pedido_id = '99d5e148-7f0a-4cad-8866-58bd71682d48';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('99d5e148-7f0a-4cad-8866-58bd71682d48', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 27.52, '2026-05-28', 'futura'),
('99d5e148-7f0a-4cad-8866-58bd71682d48', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 27.52, '2026-06-25', 'futura'),
('99d5e148-7f0a-4cad-8866-58bd71682d48', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 27.52, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ffc26c62-b73b-44c3-a439-6fd2f226198c';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ffc26c62-b73b-44c3-a439-6fd2f226198c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 13.33, '2026-05-28', 'futura'),
('ffc26c62-b73b-44c3-a439-6fd2f226198c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 13.33, '2026-06-25', 'futura'),
('ffc26c62-b73b-44c3-a439-6fd2f226198c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 13.34, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'e9e164ee-f682-4c7a-9b34-43158a076089';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('e9e164ee-f682-4c7a-9b34-43158a076089', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 53.12, '2026-05-28', 'futura'),
('e9e164ee-f682-4c7a-9b34-43158a076089', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 53.12, '2026-06-25', 'futura'),
('e9e164ee-f682-4c7a-9b34-43158a076089', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 53.12, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = '8067394b-3cb0-4dce-85c9-71a0d8f557cc';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('8067394b-3cb0-4dce-85c9-71a0d8f557cc', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 61.33, '2026-05-28', 'futura'),
('8067394b-3cb0-4dce-85c9-71a0d8f557cc', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 61.33, '2026-06-25', 'futura'),
('8067394b-3cb0-4dce-85c9-71a0d8f557cc', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 61.34, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = '8e083277-77e5-491a-9593-6c7b33da43f6';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('8e083277-77e5-491a-9593-6c7b33da43f6', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 261.44, '2026-05-28', 'futura'),
('8e083277-77e5-491a-9593-6c7b33da43f6', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 261.44, '2026-06-25', 'futura'),
('8e083277-77e5-491a-9593-6c7b33da43f6', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 261.44, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = '91855bff-c01d-433d-a067-4e1e62bae9b0';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('91855bff-c01d-433d-a067-4e1e62bae9b0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 233.6, '2026-05-28', 'futura'),
('91855bff-c01d-433d-a067-4e1e62bae9b0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 233.6, '2026-06-25', 'futura'),
('91855bff-c01d-433d-a067-4e1e62bae9b0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 233.6, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'df0fd626-3176-4782-87b6-cf773b8c7b28';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('df0fd626-3176-4782-87b6-cf773b8c7b28', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 48.85, '2026-05-28', 'futura'),
('df0fd626-3176-4782-87b6-cf773b8c7b28', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 48.85, '2026-06-25', 'futura'),
('df0fd626-3176-4782-87b6-cf773b8c7b28', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 48.86, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ac0522c8-934b-4e1b-b4a8-2c6835061ba0';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ac0522c8-934b-4e1b-b4a8-2c6835061ba0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 17.92, '2026-05-28', 'futura'),
('ac0522c8-934b-4e1b-b4a8-2c6835061ba0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 17.92, '2026-06-25', 'futura'),
('ac0522c8-934b-4e1b-b4a8-2c6835061ba0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 17.92, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'e63d6465-772b-4f3e-a434-c543ec990146';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('e63d6465-772b-4f3e-a434-c543ec990146', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 52, '2026-05-28', 'futura'),
('e63d6465-772b-4f3e-a434-c543ec990146', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 52, '2026-06-25', 'futura'),
('e63d6465-772b-4f3e-a434-c543ec990146', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 52, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = '27194220-0c07-4c76-bd5f-72c5ec9b5282';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('27194220-0c07-4c76-bd5f-72c5ec9b5282', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2326.93, '2026-05-28', 'futura'),
('27194220-0c07-4c76-bd5f-72c5ec9b5282', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2326.93, '2026-06-25', 'futura'),
('27194220-0c07-4c76-bd5f-72c5ec9b5282', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2326.94, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'dde26d37-4fab-45ce-918d-1c12c8085c54';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('dde26d37-4fab-45ce-918d-1c12c8085c54', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 232.96, '2026-05-28', 'futura'),
('dde26d37-4fab-45ce-918d-1c12c8085c54', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 232.96, '2026-06-25', 'futura'),
('dde26d37-4fab-45ce-918d-1c12c8085c54', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 232.96, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = '661a655c-c73f-48a4-af2e-ffbc12935792';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('661a655c-c73f-48a4-af2e-ffbc12935792', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1317.12, '2026-05-28', 'futura'),
('661a655c-c73f-48a4-af2e-ffbc12935792', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 1317.12, '2026-06-25', 'futura'),
('661a655c-c73f-48a4-af2e-ffbc12935792', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 1317.12, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = '98be8f9f-838c-445a-a0cc-8c0e930a30b0';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('98be8f9f-838c-445a-a0cc-8c0e930a30b0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1030.57, '2026-05-28', 'futura'),
('98be8f9f-838c-445a-a0cc-8c0e930a30b0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 1030.57, '2026-06-25', 'futura'),
('98be8f9f-838c-445a-a0cc-8c0e930a30b0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 1030.57, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = '1c4353b4-0881-4960-ae07-fd7659607897';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('1c4353b4-0881-4960-ae07-fd7659607897', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 28.48, '2026-05-28', 'futura'),
('1c4353b4-0881-4960-ae07-fd7659607897', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 28.48, '2026-06-25', 'futura'),
('1c4353b4-0881-4960-ae07-fd7659607897', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 28.48, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'df04926e-fb7c-4503-bd41-f0b1f71a04f9';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('df04926e-fb7c-4503-bd41-f0b1f71a04f9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 59.62, '2026-05-28', 'futura'),
('df04926e-fb7c-4503-bd41-f0b1f71a04f9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 59.62, '2026-06-25', 'futura'),
('df04926e-fb7c-4503-bd41-f0b1f71a04f9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 59.64, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'b5522e52-baff-49c8-b33a-a3d642de5e43';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('b5522e52-baff-49c8-b33a-a3d642de5e43', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 24.31, '2026-05-28', 'futura'),
('b5522e52-baff-49c8-b33a-a3d642de5e43', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 24.31, '2026-06-25', 'futura'),
('b5522e52-baff-49c8-b33a-a3d642de5e43', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 24.34, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'f7784311-cb79-4c73-8d0c-c0edd17f6a75';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('f7784311-cb79-4c73-8d0c-c0edd17f6a75', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 232.96, '2026-05-28', 'futura'),
('f7784311-cb79-4c73-8d0c-c0edd17f6a75', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 232.96, '2026-06-25', 'futura'),
('f7784311-cb79-4c73-8d0c-c0edd17f6a75', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 232.96, '2026-07-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = '8e7b1459-15fe-4673-bea3-6cf3ce1333ad';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('8e7b1459-15fe-4673-bea3-6cf3ce1333ad', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 612.69, '2026-04-27', 'futura'),
('8e7b1459-15fe-4673-bea3-6cf3ce1333ad', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 612.69, '2026-05-25', 'futura'),
('8e7b1459-15fe-4673-bea3-6cf3ce1333ad', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 612.7, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '9ddec99b-2c74-4809-8172-dc2edae53ec7';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('9ddec99b-2c74-4809-8172-dc2edae53ec7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 324.9, '2026-04-27', 'futura'),
('9ddec99b-2c74-4809-8172-dc2edae53ec7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 324.9, '2026-05-25', 'futura'),
('9ddec99b-2c74-4809-8172-dc2edae53ec7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 324.92, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '12aa4726-6c90-4200-8bee-09cbcde50a36';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('12aa4726-6c90-4200-8bee-09cbcde50a36', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 61.65, '2026-04-27', 'futura'),
('12aa4726-6c90-4200-8bee-09cbcde50a36', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 61.65, '2026-05-25', 'futura'),
('12aa4726-6c90-4200-8bee-09cbcde50a36', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 61.66, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'f33d456c-b34a-448d-b89a-9f1ceaaa74ff';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('f33d456c-b34a-448d-b89a-9f1ceaaa74ff', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 51.73, '2026-04-27', 'futura'),
('f33d456c-b34a-448d-b89a-9f1ceaaa74ff', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 51.73, '2026-05-25', 'futura'),
('f33d456c-b34a-448d-b89a-9f1ceaaa74ff', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 51.74, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '37acd4b7-20a4-4550-b7d3-26a188ef21bf';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('37acd4b7-20a4-4550-b7d3-26a188ef21bf', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 159.36, '2026-04-27', 'futura'),
('37acd4b7-20a4-4550-b7d3-26a188ef21bf', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 159.36, '2026-05-25', 'futura'),
('37acd4b7-20a4-4550-b7d3-26a188ef21bf', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 159.36, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '2690e477-7af9-4872-a5d6-ce7b35e7bf7c';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('2690e477-7af9-4872-a5d6-ce7b35e7bf7c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 266.66, '2026-04-27', 'futura'),
('2690e477-7af9-4872-a5d6-ce7b35e7bf7c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 266.66, '2026-05-25', 'futura'),
('2690e477-7af9-4872-a5d6-ce7b35e7bf7c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 266.68, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '06d8fc70-29b1-4097-a766-94d0a63327b0';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('06d8fc70-29b1-4097-a766-94d0a63327b0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 29.33, '2026-04-27', 'futura'),
('06d8fc70-29b1-4097-a766-94d0a63327b0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 29.33, '2026-05-25', 'futura'),
('06d8fc70-29b1-4097-a766-94d0a63327b0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 29.34, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '13e3d430-80b1-4fe9-8fed-a88a4c676aac';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('13e3d430-80b1-4fe9-8fed-a88a4c676aac', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 64.85, '2026-04-27', 'futura'),
('13e3d430-80b1-4fe9-8fed-a88a4c676aac', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 64.85, '2026-05-25', 'futura'),
('13e3d430-80b1-4fe9-8fed-a88a4c676aac', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 64.86, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '713f23c6-30c1-4c31-bf63-8f9b0109dccb';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('713f23c6-30c1-4c31-bf63-8f9b0109dccb', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 25.6, '2026-04-27', 'futura'),
('713f23c6-30c1-4c31-bf63-8f9b0109dccb', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 25.6, '2026-05-25', 'futura'),
('713f23c6-30c1-4c31-bf63-8f9b0109dccb', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 25.6, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '2eb469a9-6cff-4ea7-9090-64523508f6f2';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('2eb469a9-6cff-4ea7-9090-64523508f6f2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 25.38, '2026-04-27', 'futura'),
('2eb469a9-6cff-4ea7-9090-64523508f6f2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 25.38, '2026-05-25', 'futura'),
('2eb469a9-6cff-4ea7-9090-64523508f6f2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 25.4, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'f20569d1-be9d-4276-979c-186752f71f76';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('f20569d1-be9d-4276-979c-186752f71f76', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 47.68, '2026-04-27', 'futura'),
('f20569d1-be9d-4276-979c-186752f71f76', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 47.68, '2026-05-25', 'futura'),
('f20569d1-be9d-4276-979c-186752f71f76', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 47.68, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'cdc59ce6-b8ea-446f-9755-3fcc988e974a';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('cdc59ce6-b8ea-446f-9755-3fcc988e974a', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 6180, '2026-05-18', 'futura'),
('cdc59ce6-b8ea-446f-9755-3fcc988e974a', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 6180, '2026-06-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = '764a8c9b-aad4-42f6-b022-77e33d103066';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('764a8c9b-aad4-42f6-b022-77e33d103066', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 6180, '2026-05-18', 'futura'),
('764a8c9b-aad4-42f6-b022-77e33d103066', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 6180, '2026-06-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'b1615cd4-3c59-4931-a8ef-e1038c3fbf3b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('b1615cd4-3c59-4931-a8ef-e1038c3fbf3b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 3090, '2026-05-18', 'futura'),
('b1615cd4-3c59-4931-a8ef-e1038c3fbf3b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 3090, '2026-06-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = '01923767-4485-40db-b999-a2cd359dab7c';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('01923767-4485-40db-b999-a2cd359dab7c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 5120, '2026-05-18', 'futura'),
('01923767-4485-40db-b999-a2cd359dab7c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 5120, '2026-06-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a92bbc65-7a53-4832-9507-75efafb9fb11';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a92bbc65-7a53-4832-9507-75efafb9fb11', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2236.8, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'de602163-3019-4588-8029-b0f6821af04a';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('de602163-3019-4588-8029-b0f6821af04a', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 420, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = '8bbcc736-1d1a-4a89-aa3f-cabddade66c2';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('8bbcc736-1d1a-4a89-aa3f-cabddade66c2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2448, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = '46227450-6a39-4dc2-96f9-c5190ff40a78';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('46227450-6a39-4dc2-96f9-c5190ff40a78', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 51.78, '2026-05-15', 'futura'),
('46227450-6a39-4dc2-96f9-c5190ff40a78', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 51.78, '2026-05-29', 'futura'),
('46227450-6a39-4dc2-96f9-c5190ff40a78', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 51.8, '2026-06-12', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'b467dd8c-330e-4335-88d9-60ad25e281bd';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('b467dd8c-330e-4335-88d9-60ad25e281bd', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 9228.16, '2026-06-12', 'futura'),
('b467dd8c-330e-4335-88d9-60ad25e281bd', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 9228.16, '2026-07-10', 'futura'),
('b467dd8c-330e-4335-88d9-60ad25e281bd', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 9228.16, '2026-08-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'b89f19f5-fa99-4ae1-b7a8-ecc939c6119b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('b89f19f5-fa99-4ae1-b7a8-ecc939c6119b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 13069.01, '2026-06-12', 'futura'),
('b89f19f5-fa99-4ae1-b7a8-ecc939c6119b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 13069.01, '2026-07-10', 'futura'),
('b89f19f5-fa99-4ae1-b7a8-ecc939c6119b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 13069.02, '2026-08-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '21c1d394-beda-468f-93a1-e5982860a750';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('21c1d394-beda-468f-93a1-e5982860a750', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 96, '2026-06-17', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'cfc7ff6a-eb52-4416-bdc0-aed2d2336298';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('cfc7ff6a-eb52-4416-bdc0-aed2d2336298', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 312, '2026-06-17', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'fea2c896-9cef-444b-be4c-9d0540d7d71d';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('fea2c896-9cef-444b-be4c-9d0540d7d71d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 832, '2026-06-17', 'futura');
DELETE FROM parcelas WHERE pedido_id = '6063c4e2-1b62-47d8-803e-5fb051e1d4d3';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('6063c4e2-1b62-47d8-803e-5fb051e1d4d3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 488, '2026-04-17', 'futura'),
('6063c4e2-1b62-47d8-803e-5fb051e1d4d3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 488, '2026-05-15', 'futura');
DELETE FROM parcelas WHERE pedido_id = '35c3c8a4-5285-45fb-a64d-ecc662a7e35c';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('35c3c8a4-5285-45fb-a64d-ecc662a7e35c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 640, '2026-04-17', 'futura'),
('35c3c8a4-5285-45fb-a64d-ecc662a7e35c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 640, '2026-05-15', 'futura');
DELETE FROM parcelas WHERE pedido_id = '0ecbbd24-b108-424f-bc9a-f28b7b5c81e1';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('0ecbbd24-b108-424f-bc9a-f28b7b5c81e1', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 286.4, '2026-06-17', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a753bec2-4a31-4a69-8a11-2e03df671e70';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a753bec2-4a31-4a69-8a11-2e03df671e70', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 15464.53, '2026-06-12', 'futura'),
('a753bec2-4a31-4a69-8a11-2e03df671e70', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 15464.53, '2026-07-10', 'futura'),
('a753bec2-4a31-4a69-8a11-2e03df671e70', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 15464.54, '2026-08-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '8de88117-9e54-4ff6-afa7-699fc257ff58';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('8de88117-9e54-4ff6-afa7-699fc257ff58', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 4595.41, '2026-06-12', 'futura'),
('8de88117-9e54-4ff6-afa7-699fc257ff58', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 4595.41, '2026-07-10', 'futura'),
('8de88117-9e54-4ff6-afa7-699fc257ff58', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 4595.42, '2026-08-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'f6716fbd-185d-4d73-a19c-c16965cb8562';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('f6716fbd-185d-4d73-a19c-c16965cb8562', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2314.66, '2026-06-12', 'futura'),
('f6716fbd-185d-4d73-a19c-c16965cb8562', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2314.66, '2026-07-10', 'futura'),
('f6716fbd-185d-4d73-a19c-c16965cb8562', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2314.68, '2026-08-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '5cce680a-72d8-4e01-8cad-f1d937b72a51';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('5cce680a-72d8-4e01-8cad-f1d937b72a51', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2516.8, '2026-06-12', 'futura'),
('5cce680a-72d8-4e01-8cad-f1d937b72a51', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2516.8, '2026-07-10', 'futura'),
('5cce680a-72d8-4e01-8cad-f1d937b72a51', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2516.8, '2026-08-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '38a5c018-88ad-49b5-903f-94f267e6a59c';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('38a5c018-88ad-49b5-903f-94f267e6a59c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 812.8, '2026-06-12', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c05eebc1-916c-4acf-bffe-688fc31fc55b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c05eebc1-916c-4acf-bffe-688fc31fc55b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 192, '2026-06-29', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'e684d567-01e5-4b33-9773-f61a96043aca';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('e684d567-01e5-4b33-9773-f61a96043aca', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 624, '2026-06-29', 'futura');
DELETE FROM parcelas WHERE pedido_id = '6a8e779e-40fb-4762-984d-ecb94273c682';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('6a8e779e-40fb-4762-984d-ecb94273c682', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1440, '2026-06-12', 'futura');
DELETE FROM parcelas WHERE pedido_id = '008304ee-2f3e-4164-adfd-2f19d5be78c2';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('008304ee-2f3e-4164-adfd-2f19d5be78c2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 572.8, '2026-06-29', 'futura');
DELETE FROM parcelas WHERE pedido_id = '7cfc48a0-6f98-4c4e-905b-65f9f19e9291';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('7cfc48a0-6f98-4c4e-905b-65f9f19e9291', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2429.75, '2026-05-21', 'futura'),
('7cfc48a0-6f98-4c4e-905b-65f9f19e9291', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2429.75, '2026-06-18', 'futura'),
('7cfc48a0-6f98-4c4e-905b-65f9f19e9291', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2429.75, '2026-07-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a59a4a3e-dd95-4f7e-8a2a-60c5ce6ec172';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a59a4a3e-dd95-4f7e-8a2a-60c5ce6ec172', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 554.66, '2026-05-21', 'futura'),
('a59a4a3e-dd95-4f7e-8a2a-60c5ce6ec172', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 554.66, '2026-06-04', 'futura'),
('a59a4a3e-dd95-4f7e-8a2a-60c5ce6ec172', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 554.68, '2026-06-18', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a25c1592-5038-4ebe-b6b0-dde28a21017b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a25c1592-5038-4ebe-b6b0-dde28a21017b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 197.12, '2026-05-21', 'futura'),
('a25c1592-5038-4ebe-b6b0-dde28a21017b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 197.12, '2026-06-04', 'futura'),
('a25c1592-5038-4ebe-b6b0-dde28a21017b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 197.12, '2026-06-18', 'futura');
DELETE FROM parcelas WHERE pedido_id = '022272a3-58c8-499b-bbda-b7d3ac38b65d';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('022272a3-58c8-499b-bbda-b7d3ac38b65d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 67.2, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a99d17a8-03f9-40be-ac7f-429fdb30b0e0';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a99d17a8-03f9-40be-ac7f-429fdb30b0e0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 4414.96, '2026-05-21', 'futura'),
('a99d17a8-03f9-40be-ac7f-429fdb30b0e0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 4414.96, '2026-06-18', 'futura'),
('a99d17a8-03f9-40be-ac7f-429fdb30b0e0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 4414.96, '2026-07-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'f8c3fd52-e783-4b20-aa71-cc528da484d1';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('f8c3fd52-e783-4b20-aa71-cc528da484d1', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 920, '2026-05-21', 'futura'),
('f8c3fd52-e783-4b20-aa71-cc528da484d1', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 920, '2026-06-04', 'futura'),
('f8c3fd52-e783-4b20-aa71-cc528da484d1', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 920, '2026-06-18', 'futura');
DELETE FROM parcelas WHERE pedido_id = '2c8eece0-58f2-4270-89a9-27c6ccb935e2';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('2c8eece0-58f2-4270-89a9-27c6ccb935e2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 429.33, '2026-05-21', 'futura'),
('2c8eece0-58f2-4270-89a9-27c6ccb935e2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 429.33, '2026-06-04', 'futura'),
('2c8eece0-58f2-4270-89a9-27c6ccb935e2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 429.34, '2026-06-18', 'futura');
DELETE FROM parcelas WHERE pedido_id = '3065c336-2f51-4ca5-a9ea-0a62c98a1812';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('3065c336-2f51-4ca5-a9ea-0a62c98a1812', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 201.6, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = '8476d140-10bc-47ee-9a59-e298957d449b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('8476d140-10bc-47ee-9a59-e298957d449b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 21120, '2026-05-20', 'futura');
DELETE FROM parcelas WHERE pedido_id = '83f93d1a-e724-4df9-914b-21b96e5a317f';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('83f93d1a-e724-4df9-914b-21b96e5a317f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1440, '2026-06-17', 'futura');
DELETE FROM parcelas WHERE pedido_id = '2ab536df-74df-4d1a-9bda-74ae99e9257a';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('2ab536df-74df-4d1a-9bda-74ae99e9257a', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 422.4, '2026-06-19', 'futura'),
('2ab536df-74df-4d1a-9bda-74ae99e9257a', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 422.4, '2026-07-20', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'f918e287-b624-47fe-95dd-0f9eb62d2fdb';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('f918e287-b624-47fe-95dd-0f9eb62d2fdb', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 448, '2026-07-03', 'futura');
DELETE FROM parcelas WHERE pedido_id = '509d8263-6d98-446e-8819-5198d72f4f33';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('509d8263-6d98-446e-8819-5198d72f4f33', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1088, '2026-07-03', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c0bd6bb4-a8a7-4317-8a65-bd07518350c5';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c0bd6bb4-a8a7-4317-8a65-bd07518350c5', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 63.36, '2026-06-19', 'futura'),
('c0bd6bb4-a8a7-4317-8a65-bd07518350c5', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 63.36, '2026-07-20', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c266a787-7a44-458a-8f58-bddaa958dad6';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c266a787-7a44-458a-8f58-bddaa958dad6', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 6933.33, '2026-07-13', 'futura'),
('c266a787-7a44-458a-8f58-bddaa958dad6', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 6933.33, '2026-07-27', 'futura'),
('c266a787-7a44-458a-8f58-bddaa958dad6', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 6933.34, '2026-08-10', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c660d709-5fb0-4c88-9271-1240462aa3a2';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c660d709-5fb0-4c88-9271-1240462aa3a2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2278.4, '2026-07-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = '2567aa09-6412-4870-b475-680b6cc49cda';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('2567aa09-6412-4870-b475-680b6cc49cda', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 8508.79, '2026-07-15', 'futura'),
('2567aa09-6412-4870-b475-680b6cc49cda', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 8508.81, '2026-08-14', 'futura');
DELETE FROM parcelas WHERE pedido_id = '2fb8edac-6e90-41ef-bf81-9797027b1b09';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('2fb8edac-6e90-41ef-bf81-9797027b1b09', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 832, '2026-07-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = '6a0c18da-7020-4afe-bddc-3cc85316bbf9';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('6a0c18da-7020-4afe-bddc-3cc85316bbf9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 89.6, '2026-07-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a3c7f780-8ce7-4de8-b8c1-76628a298e9a';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a3c7f780-8ce7-4de8-b8c1-76628a298e9a', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 591.36, '2026-07-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'd08aacb0-6376-4ae4-b518-98dc378b3e48';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('d08aacb0-6376-4ae4-b518-98dc378b3e48', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 224, '2026-07-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = '7635da76-dd10-442a-90c4-441f0abf4a6c';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('7635da76-dd10-442a-90c4-441f0abf4a6c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1164.8, '2026-07-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c1af1ac2-36a9-4643-aff4-6e09037a8532';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c1af1ac2-36a9-4643-aff4-6e09037a8532', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 192, '2026-07-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = '450085d8-958c-4b9d-a89b-3160fabe5fac';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('450085d8-958c-4b9d-a89b-3160fabe5fac', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 6346.66, '2026-07-13', 'futura'),
('450085d8-958c-4b9d-a89b-3160fabe5fac', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 6346.66, '2026-07-27', 'futura'),
('450085d8-958c-4b9d-a89b-3160fabe5fac', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 6346.68, '2026-08-10', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ee2d7bea-d0da-4e3e-b2de-2323bba7d0d4';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ee2d7bea-d0da-4e3e-b2de-2323bba7d0d4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 3584, '2026-07-06', 'futura'),
('ee2d7bea-d0da-4e3e-b2de-2323bba7d0d4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 3584, '2026-07-21', 'futura'),
('ee2d7bea-d0da-4e3e-b2de-2323bba7d0d4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 3584, '2026-08-05', 'futura'),
('ee2d7bea-d0da-4e3e-b2de-2323bba7d0d4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 4, 3584, '2026-08-21', 'futura'),
('ee2d7bea-d0da-4e3e-b2de-2323bba7d0d4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 5, 3584, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '797877f8-a0b2-457f-975b-8461d4ef9ba3';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('797877f8-a0b2-457f-975b-8461d4ef9ba3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2328, '2026-07-13', 'futura');
DELETE FROM parcelas WHERE pedido_id = '387fb604-e59b-4696-917f-511f8748237e';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('387fb604-e59b-4696-917f-511f8748237e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 65.24, '2026-07-06', 'futura'),
('387fb604-e59b-4696-917f-511f8748237e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 65.24, '2026-07-21', 'futura'),
('387fb604-e59b-4696-917f-511f8748237e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 65.24, '2026-08-05', 'futura'),
('387fb604-e59b-4696-917f-511f8748237e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 4, 65.24, '2026-08-21', 'futura'),
('387fb604-e59b-4696-917f-511f8748237e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 5, 65.28, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '3923410b-43ab-447a-999d-9ad4ba0236d2';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('3923410b-43ab-447a-999d-9ad4ba0236d2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 23.65, '2026-07-06', 'futura'),
('3923410b-43ab-447a-999d-9ad4ba0236d2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 23.65, '2026-07-21', 'futura'),
('3923410b-43ab-447a-999d-9ad4ba0236d2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 23.65, '2026-08-05', 'futura'),
('3923410b-43ab-447a-999d-9ad4ba0236d2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 4, 23.65, '2026-08-21', 'futura'),
('3923410b-43ab-447a-999d-9ad4ba0236d2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 5, 23.67, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ca44d170-c84d-4126-a510-2ab484e32aa8';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ca44d170-c84d-4126-a510-2ab484e32aa8', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 7.02, '2026-07-06', 'futura'),
('ca44d170-c84d-4126-a510-2ab484e32aa8', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 7.02, '2026-07-21', 'futura'),
('ca44d170-c84d-4126-a510-2ab484e32aa8', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 7.02, '2026-08-05', 'futura'),
('ca44d170-c84d-4126-a510-2ab484e32aa8', '54e7018a-5475-4132-a15d-913b1d28d5d0', 4, 7.02, '2026-08-21', 'futura'),
('ca44d170-c84d-4126-a510-2ab484e32aa8', '54e7018a-5475-4132-a15d-913b1d28d5d0', 5, 7.06, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '772c5b07-52ed-4ebc-9883-c73e9bbde8bc';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('772c5b07-52ed-4ebc-9883-c73e9bbde8bc', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 232.96, '2026-07-06', 'futura'),
('772c5b07-52ed-4ebc-9883-c73e9bbde8bc', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 232.96, '2026-07-21', 'futura'),
('772c5b07-52ed-4ebc-9883-c73e9bbde8bc', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 232.96, '2026-08-05', 'futura'),
('772c5b07-52ed-4ebc-9883-c73e9bbde8bc', '54e7018a-5475-4132-a15d-913b1d28d5d0', 4, 232.96, '2026-08-21', 'futura'),
('772c5b07-52ed-4ebc-9883-c73e9bbde8bc', '54e7018a-5475-4132-a15d-913b1d28d5d0', 5, 232.96, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '3dcb5d55-0daa-4419-a022-798a29ed9bfe';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('3dcb5d55-0daa-4419-a022-798a29ed9bfe', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 21.92, '2026-07-06', 'futura'),
('3dcb5d55-0daa-4419-a022-798a29ed9bfe', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 21.92, '2026-07-21', 'futura'),
('3dcb5d55-0daa-4419-a022-798a29ed9bfe', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 21.92, '2026-08-05', 'futura'),
('3dcb5d55-0daa-4419-a022-798a29ed9bfe', '54e7018a-5475-4132-a15d-913b1d28d5d0', 4, 21.92, '2026-08-21', 'futura'),
('3dcb5d55-0daa-4419-a022-798a29ed9bfe', '54e7018a-5475-4132-a15d-913b1d28d5d0', 5, 21.92, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ff2a8670-eb94-42c3-b7fa-cfc804006d34';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ff2a8670-eb94-42c3-b7fa-cfc804006d34', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 844.8, '2026-07-13', 'futura'),
('ff2a8670-eb94-42c3-b7fa-cfc804006d34', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 844.8, '2026-08-10', 'futura'),
('ff2a8670-eb94-42c3-b7fa-cfc804006d34', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 844.8, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ae537772-537d-44a9-b7c3-db7f4759825e';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ae537772-537d-44a9-b7c3-db7f4759825e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 614.4, '2026-07-13', 'futura'),
('ae537772-537d-44a9-b7c3-db7f4759825e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 614.4, '2026-08-10', 'futura'),
('ae537772-537d-44a9-b7c3-db7f4759825e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 614.4, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '19659f55-fe19-4ef1-9fd9-010b245f1bd7';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('19659f55-fe19-4ef1-9fd9-010b245f1bd7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 614.4, '2026-07-13', 'futura'),
('19659f55-fe19-4ef1-9fd9-010b245f1bd7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 614.4, '2026-08-10', 'futura'),
('19659f55-fe19-4ef1-9fd9-010b245f1bd7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 614.4, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a375c7d0-deb1-4e61-83fc-483c6759304f';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a375c7d0-deb1-4e61-83fc-483c6759304f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1856, '2026-07-13', 'futura'),
('a375c7d0-deb1-4e61-83fc-483c6759304f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 1856, '2026-08-10', 'futura'),
('a375c7d0-deb1-4e61-83fc-483c6759304f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 1856, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'b6c16adb-c495-4fc4-be1d-92dbd5077757';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('b6c16adb-c495-4fc4-be1d-92dbd5077757', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2474.66, '2026-07-13', 'futura'),
('b6c16adb-c495-4fc4-be1d-92dbd5077757', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2474.66, '2026-08-10', 'futura'),
('b6c16adb-c495-4fc4-be1d-92dbd5077757', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2474.68, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '7a25628c-e39d-4da5-838a-3964362c9c65';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('7a25628c-e39d-4da5-838a-3964362c9c65', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2474.66, '2026-07-13', 'futura'),
('7a25628c-e39d-4da5-838a-3964362c9c65', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2474.66, '2026-08-10', 'futura'),
('7a25628c-e39d-4da5-838a-3964362c9c65', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2474.68, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '3b0cc93e-628e-45c8-8b97-dfbbe133e4ef';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('3b0cc93e-628e-45c8-8b97-dfbbe133e4ef', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 551.04, '2026-07-13', 'futura'),
('3b0cc93e-628e-45c8-8b97-dfbbe133e4ef', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 551.04, '2026-08-10', 'futura'),
('3b0cc93e-628e-45c8-8b97-dfbbe133e4ef', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 551.04, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c76ac6a4-b3ba-4c1f-a7c8-45c271cb6d1f';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c76ac6a4-b3ba-4c1f-a7c8-45c271cb6d1f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 551.04, '2026-07-13', 'futura'),
('c76ac6a4-b3ba-4c1f-a7c8-45c271cb6d1f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 551.04, '2026-08-10', 'futura'),
('c76ac6a4-b3ba-4c1f-a7c8-45c271cb6d1f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 551.04, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '97327057-d82c-4fd8-8067-0b204add260e';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('97327057-d82c-4fd8-8067-0b204add260e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 551.04, '2026-07-13', 'futura'),
('97327057-d82c-4fd8-8067-0b204add260e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 551.04, '2026-08-10', 'futura'),
('97327057-d82c-4fd8-8067-0b204add260e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 551.04, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'e21c9c9d-c9d8-4e0f-9936-ffb77b393e23';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('e21c9c9d-c9d8-4e0f-9936-ffb77b393e23', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1785.6, '2026-07-13', 'futura'),
('e21c9c9d-c9d8-4e0f-9936-ffb77b393e23', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 1785.6, '2026-08-10', 'futura'),
('e21c9c9d-c9d8-4e0f-9936-ffb77b393e23', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 1785.6, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '126dfa1d-88a8-4fdd-bdc6-3dbe37850071';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('126dfa1d-88a8-4fdd-bdc6-3dbe37850071', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1785.6, '2026-07-13', 'futura'),
('126dfa1d-88a8-4fdd-bdc6-3dbe37850071', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 1785.6, '2026-08-10', 'futura'),
('126dfa1d-88a8-4fdd-bdc6-3dbe37850071', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 1785.6, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'b575b872-54ab-4c1d-bf78-3a1576035c65';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('b575b872-54ab-4c1d-bf78-3a1576035c65', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1785.6, '2026-07-13', 'futura'),
('b575b872-54ab-4c1d-bf78-3a1576035c65', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 1785.6, '2026-08-10', 'futura'),
('b575b872-54ab-4c1d-bf78-3a1576035c65', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 1785.6, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '1934756e-3982-481e-b52d-e866c153607d';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('1934756e-3982-481e-b52d-e866c153607d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 373.33, '2026-07-13', 'futura'),
('1934756e-3982-481e-b52d-e866c153607d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 373.33, '2026-08-10', 'futura'),
('1934756e-3982-481e-b52d-e866c153607d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 373.34, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '387d55a2-64f4-4719-ac33-4538a7623553';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('387d55a2-64f4-4719-ac33-4538a7623553', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 93.65, '2026-07-13', 'futura'),
('387d55a2-64f4-4719-ac33-4538a7623553', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 93.65, '2026-08-10', 'futura'),
('387d55a2-64f4-4719-ac33-4538a7623553', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 93.66, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '488249e1-b9ca-42c3-9b46-eb66466e6558';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('488249e1-b9ca-42c3-9b46-eb66466e6558', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 237.44, '2026-07-13', 'futura'),
('488249e1-b9ca-42c3-9b46-eb66466e6558', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 237.44, '2026-08-10', 'futura'),
('488249e1-b9ca-42c3-9b46-eb66466e6558', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 237.44, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '044d4b37-f841-4370-be5b-7d2703582456';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('044d4b37-f841-4370-be5b-7d2703582456', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 316.58, '2026-07-13', 'futura'),
('044d4b37-f841-4370-be5b-7d2703582456', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 316.58, '2026-08-10', 'futura'),
('044d4b37-f841-4370-be5b-7d2703582456', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 316.6, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '7b8d3906-1c2d-4f68-ba8d-8ce16c58ee77';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('7b8d3906-1c2d-4f68-ba8d-8ce16c58ee77', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 479.36, '2026-07-13', 'futura'),
('7b8d3906-1c2d-4f68-ba8d-8ce16c58ee77', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 479.36, '2026-08-10', 'futura'),
('7b8d3906-1c2d-4f68-ba8d-8ce16c58ee77', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 479.36, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'd00157c0-928c-4620-af19-89468e441751';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('d00157c0-928c-4620-af19-89468e441751', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 79.89, '2026-07-13', 'futura'),
('d00157c0-928c-4620-af19-89468e441751', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 79.89, '2026-08-10', 'futura'),
('d00157c0-928c-4620-af19-89468e441751', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 79.9, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'e42006d8-75dd-4339-a44c-3c830fed35b3';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('e42006d8-75dd-4339-a44c-3c830fed35b3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 99.52, '2026-07-13', 'futura'),
('e42006d8-75dd-4339-a44c-3c830fed35b3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 99.52, '2026-08-10', 'futura'),
('e42006d8-75dd-4339-a44c-3c830fed35b3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 99.52, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '24646615-e30c-42e5-ab01-5a701c88a424';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('24646615-e30c-42e5-ab01-5a701c88a424', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2558.93, '2026-07-13', 'futura'),
('24646615-e30c-42e5-ab01-5a701c88a424', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2558.93, '2026-08-10', 'futura'),
('24646615-e30c-42e5-ab01-5a701c88a424', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2558.94, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'b5a2256c-9603-4a82-a840-8ae89491a714';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('b5a2256c-9603-4a82-a840-8ae89491a714', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2.56, '2026-07-13', 'futura'),
('b5a2256c-9603-4a82-a840-8ae89491a714', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2.56, '2026-08-10', 'futura'),
('b5a2256c-9603-4a82-a840-8ae89491a714', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2.56, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c37dadc5-be6f-47be-8b3a-c909e25b7975';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c37dadc5-be6f-47be-8b3a-c909e25b7975', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 9.6, '2026-07-13', 'futura'),
('c37dadc5-be6f-47be-8b3a-c909e25b7975', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 9.6, '2026-08-10', 'futura'),
('c37dadc5-be6f-47be-8b3a-c909e25b7975', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 9.6, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'fb484337-4ff1-4039-97e4-3fa527e68adf';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('fb484337-4ff1-4039-97e4-3fa527e68adf', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 8.32, '2026-07-13', 'futura'),
('fb484337-4ff1-4039-97e4-3fa527e68adf', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 8.32, '2026-08-10', 'futura'),
('fb484337-4ff1-4039-97e4-3fa527e68adf', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 8.32, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'bfaaa179-3049-4068-88e8-3a94f5924030';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('bfaaa179-3049-4068-88e8-3a94f5924030', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 8, '2026-07-13', 'futura'),
('bfaaa179-3049-4068-88e8-3a94f5924030', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 8, '2026-08-10', 'futura'),
('bfaaa179-3049-4068-88e8-3a94f5924030', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 8, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '5db2c2af-211c-4a82-ae5f-be12275f7010';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('5db2c2af-211c-4a82-ae5f-be12275f7010', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 93.65, '2026-07-13', 'futura'),
('5db2c2af-211c-4a82-ae5f-be12275f7010', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 93.65, '2026-08-10', 'futura'),
('5db2c2af-211c-4a82-ae5f-be12275f7010', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 93.66, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '8f929dbb-238e-4391-a9a0-ff70ff74661d';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('8f929dbb-238e-4391-a9a0-ff70ff74661d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 259.62, '2026-07-13', 'futura'),
('8f929dbb-238e-4391-a9a0-ff70ff74661d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 259.62, '2026-08-10', 'futura'),
('8f929dbb-238e-4391-a9a0-ff70ff74661d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 259.64, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'af5ecba5-a82c-4e25-b5eb-618a1a8be648';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('af5ecba5-a82c-4e25-b5eb-618a1a8be648', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 257.7, '2026-07-13', 'futura'),
('af5ecba5-a82c-4e25-b5eb-618a1a8be648', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 257.7, '2026-08-10', 'futura'),
('af5ecba5-a82c-4e25-b5eb-618a1a8be648', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 257.72, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '251f2f8b-024c-41cc-9810-ce38e6b5a818';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('251f2f8b-024c-41cc-9810-ce38e6b5a818', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 157.33, '2026-07-13', 'futura'),
('251f2f8b-024c-41cc-9810-ce38e6b5a818', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 157.33, '2026-08-10', 'futura'),
('251f2f8b-024c-41cc-9810-ce38e6b5a818', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 157.34, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'cf4920a4-0b19-4e12-9938-0b69da284d00';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('cf4920a4-0b19-4e12-9938-0b69da284d00', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 107.52, '2026-07-13', 'futura'),
('cf4920a4-0b19-4e12-9938-0b69da284d00', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 107.52, '2026-08-10', 'futura'),
('cf4920a4-0b19-4e12-9938-0b69da284d00', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 107.52, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '1ff5a58a-5960-45ea-948c-7a5fc21742f9';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('1ff5a58a-5960-45ea-948c-7a5fc21742f9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 967.68, '2026-07-13', 'futura'),
('1ff5a58a-5960-45ea-948c-7a5fc21742f9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 967.68, '2026-08-10', 'futura'),
('1ff5a58a-5960-45ea-948c-7a5fc21742f9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 967.68, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '2bdeb312-21ed-4f28-a863-71cafa2512e9';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('2bdeb312-21ed-4f28-a863-71cafa2512e9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 215.04, '2026-07-13', 'futura'),
('2bdeb312-21ed-4f28-a863-71cafa2512e9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 215.04, '2026-08-10', 'futura'),
('2bdeb312-21ed-4f28-a863-71cafa2512e9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 215.04, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'be1e258a-5a0b-4b5b-a8e2-ee2e3be8e961';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('be1e258a-5a0b-4b5b-a8e2-ee2e3be8e961', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 103.25, '2026-07-13', 'futura'),
('be1e258a-5a0b-4b5b-a8e2-ee2e3be8e961', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 103.25, '2026-08-10', 'futura'),
('be1e258a-5a0b-4b5b-a8e2-ee2e3be8e961', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 103.26, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '50fd017c-644c-4516-b4e3-ee0cf8d4c1b5';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('50fd017c-644c-4516-b4e3-ee0cf8d4c1b5', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 100.9, '2026-07-13', 'futura'),
('50fd017c-644c-4516-b4e3-ee0cf8d4c1b5', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 100.9, '2026-08-10', 'futura'),
('50fd017c-644c-4516-b4e3-ee0cf8d4c1b5', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 100.92, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '700cb984-0af7-4de3-8d1e-c5fd2172425b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('700cb984-0af7-4de3-8d1e-c5fd2172425b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 432.85, '2026-07-13', 'futura'),
('700cb984-0af7-4de3-8d1e-c5fd2172425b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 432.85, '2026-08-10', 'futura'),
('700cb984-0af7-4de3-8d1e-c5fd2172425b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 432.86, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'f1898da1-3a9d-4475-a4f8-3a40ff9e7681';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('f1898da1-3a9d-4475-a4f8-3a40ff9e7681', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 277.33, '2026-07-13', 'futura'),
('f1898da1-3a9d-4475-a4f8-3a40ff9e7681', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 277.33, '2026-08-10', 'futura'),
('f1898da1-3a9d-4475-a4f8-3a40ff9e7681', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 277.34, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '02ac2b58-e3ac-4f56-9f35-0e638b5f8e57';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('02ac2b58-e3ac-4f56-9f35-0e638b5f8e57', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 208.21, '2026-07-13', 'futura'),
('02ac2b58-e3ac-4f56-9f35-0e638b5f8e57', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 208.21, '2026-08-10', 'futura'),
('02ac2b58-e3ac-4f56-9f35-0e638b5f8e57', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 208.22, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '6e9077fb-a68f-4a1d-83cf-9800e66d15d4';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('6e9077fb-a68f-4a1d-83cf-9800e66d15d4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 525.54, '2026-07-13', 'futura'),
('6e9077fb-a68f-4a1d-83cf-9800e66d15d4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 525.54, '2026-08-10', 'futura'),
('6e9077fb-a68f-4a1d-83cf-9800e66d15d4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 525.56, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'd0b19512-8179-4232-8c24-145524b9e31a';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('d0b19512-8179-4232-8c24-145524b9e31a', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 109.76, '2026-07-13', 'futura'),
('d0b19512-8179-4232-8c24-145524b9e31a', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 109.76, '2026-08-10', 'futura'),
('d0b19512-8179-4232-8c24-145524b9e31a', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 109.76, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '0812acaa-4581-4acc-a728-980df1ec2a79';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('0812acaa-4581-4acc-a728-980df1ec2a79', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 56.96, '2026-07-13', 'futura'),
('0812acaa-4581-4acc-a728-980df1ec2a79', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 56.96, '2026-08-10', 'futura'),
('0812acaa-4581-4acc-a728-980df1ec2a79', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 56.96, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a8599e75-0ebf-4463-9540-3d8e74cef494';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a8599e75-0ebf-4463-9540-3d8e74cef494', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2047.14, '2026-07-13', 'futura'),
('a8599e75-0ebf-4463-9540-3d8e74cef494', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2047.14, '2026-08-10', 'futura'),
('a8599e75-0ebf-4463-9540-3d8e74cef494', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2047.16, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '0d2a5c79-c327-43f5-a66c-97c0fb5f2001';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('0d2a5c79-c327-43f5-a66c-97c0fb5f2001', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 73.6, '2026-07-13', 'futura'),
('0d2a5c79-c327-43f5-a66c-97c0fb5f2001', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 73.6, '2026-08-10', 'futura'),
('0d2a5c79-c327-43f5-a66c-97c0fb5f2001', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 73.6, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '4b1e07d6-1d81-4c46-a4cb-8e82cdf581fb';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('4b1e07d6-1d81-4c46-a4cb-8e82cdf581fb', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 5013.33, '2026-07-13', 'futura'),
('4b1e07d6-1d81-4c46-a4cb-8e82cdf581fb', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 5013.33, '2026-08-10', 'futura'),
('4b1e07d6-1d81-4c46-a4cb-8e82cdf581fb', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 5013.34, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '2b8bfb56-e8ff-4a96-a95e-7130c1882de4';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('2b8bfb56-e8ff-4a96-a95e-7130c1882de4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 260.9, '2026-07-13', 'futura'),
('2b8bfb56-e8ff-4a96-a95e-7130c1882de4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 260.9, '2026-08-10', 'futura'),
('2b8bfb56-e8ff-4a96-a95e-7130c1882de4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 260.92, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c2235e82-bd88-481d-8775-a9f13455f64d';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c2235e82-bd88-481d-8775-a9f13455f64d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2442.66, '2026-07-13', 'futura'),
('c2235e82-bd88-481d-8775-a9f13455f64d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2442.66, '2026-08-10', 'futura'),
('c2235e82-bd88-481d-8775-a9f13455f64d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2442.68, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '9f1be29c-aa5e-4072-a4ca-d8608c31af4f';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('9f1be29c-aa5e-4072-a4ca-d8608c31af4f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 316.16, '2026-07-13', 'futura'),
('9f1be29c-aa5e-4072-a4ca-d8608c31af4f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 316.16, '2026-08-10', 'futura'),
('9f1be29c-aa5e-4072-a4ca-d8608c31af4f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 316.16, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '1d37a9f8-b9a9-496f-abfa-f02b625822d3';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('1d37a9f8-b9a9-496f-abfa-f02b625822d3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 20.58, '2026-07-13', 'futura'),
('1d37a9f8-b9a9-496f-abfa-f02b625822d3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 20.58, '2026-08-10', 'futura'),
('1d37a9f8-b9a9-496f-abfa-f02b625822d3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 20.6, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c940349f-707b-4404-9eea-a1e707df2ce9';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c940349f-707b-4404-9eea-a1e707df2ce9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 196.8, '2026-07-13', 'futura'),
('c940349f-707b-4404-9eea-a1e707df2ce9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 196.8, '2026-08-10', 'futura'),
('c940349f-707b-4404-9eea-a1e707df2ce9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 196.8, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '2fca2591-2dde-4fe8-a9a9-21c92fc60f7c';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('2fca2591-2dde-4fe8-a9a9-21c92fc60f7c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2186.66, '2026-07-13', 'futura'),
('2fca2591-2dde-4fe8-a9a9-21c92fc60f7c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2186.66, '2026-08-10', 'futura'),
('2fca2591-2dde-4fe8-a9a9-21c92fc60f7c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2186.68, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '886ff51e-9803-432e-9d57-ec6212e300d0';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('886ff51e-9803-432e-9d57-ec6212e300d0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 300.8, '2026-07-13', 'futura'),
('886ff51e-9803-432e-9d57-ec6212e300d0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 300.8, '2026-08-10', 'futura'),
('886ff51e-9803-432e-9d57-ec6212e300d0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 300.8, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'f17c7daf-de9d-41fe-a77d-dedbe3d45cfe';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('f17c7daf-de9d-41fe-a77d-dedbe3d45cfe', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 39.25, '2026-07-13', 'futura'),
('f17c7daf-de9d-41fe-a77d-dedbe3d45cfe', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 39.25, '2026-08-10', 'futura'),
('f17c7daf-de9d-41fe-a77d-dedbe3d45cfe', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 39.26, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '32f5a06a-263f-43f9-801d-b3c91cf5620f';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('32f5a06a-263f-43f9-801d-b3c91cf5620f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 12.8, '2026-07-13', 'futura'),
('32f5a06a-263f-43f9-801d-b3c91cf5620f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 12.8, '2026-08-10', 'futura'),
('32f5a06a-263f-43f9-801d-b3c91cf5620f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 12.8, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '6042b105-6ee5-40f2-a541-1ed3f1ad2b53';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('6042b105-6ee5-40f2-a541-1ed3f1ad2b53', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 130.34, '2026-07-13', 'futura'),
('6042b105-6ee5-40f2-a541-1ed3f1ad2b53', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 130.34, '2026-08-10', 'futura'),
('6042b105-6ee5-40f2-a541-1ed3f1ad2b53', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 130.36, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'e62b9ded-93a1-4a6d-9c18-2aff8cf9df16';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('e62b9ded-93a1-4a6d-9c18-2aff8cf9df16', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 159.68, '2026-07-13', 'futura'),
('e62b9ded-93a1-4a6d-9c18-2aff8cf9df16', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 159.68, '2026-08-10', 'futura'),
('e62b9ded-93a1-4a6d-9c18-2aff8cf9df16', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 159.68, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a33456db-e358-4e86-b59c-966e497d361f';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a33456db-e358-4e86-b59c-966e497d361f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 257.28, '2026-07-13', 'futura'),
('a33456db-e358-4e86-b59c-966e497d361f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 257.28, '2026-08-10', 'futura'),
('a33456db-e358-4e86-b59c-966e497d361f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 257.28, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '229bc080-68e8-423d-802c-0eefa1a1f08e';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('229bc080-68e8-423d-802c-0eefa1a1f08e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 48, '2026-07-13', 'futura'),
('229bc080-68e8-423d-802c-0eefa1a1f08e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 48, '2026-08-10', 'futura'),
('229bc080-68e8-423d-802c-0eefa1a1f08e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 48, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'f7496104-6fda-454c-b7c5-71c892f473dc';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('f7496104-6fda-454c-b7c5-71c892f473dc', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 7466.66, '2026-07-13', 'futura'),
('f7496104-6fda-454c-b7c5-71c892f473dc', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 7466.66, '2026-08-10', 'futura'),
('f7496104-6fda-454c-b7c5-71c892f473dc', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 7466.68, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '8670bc6a-4ddd-43af-9599-42875d0b14e9';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('8670bc6a-4ddd-43af-9599-42875d0b14e9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 771.73, '2026-07-13', 'futura'),
('8670bc6a-4ddd-43af-9599-42875d0b14e9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 771.73, '2026-08-10', 'futura'),
('8670bc6a-4ddd-43af-9599-42875d0b14e9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 771.74, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '253cff59-974f-4007-9139-21c5b5439111';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('253cff59-974f-4007-9139-21c5b5439111', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1229.86, '2026-07-13', 'futura'),
('253cff59-974f-4007-9139-21c5b5439111', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 1229.86, '2026-08-10', 'futura'),
('253cff59-974f-4007-9139-21c5b5439111', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 1229.88, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '3eeea137-21fe-4a6d-bd52-61599cb623aa';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('3eeea137-21fe-4a6d-bd52-61599cb623aa', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 114.88, '2026-07-13', 'futura'),
('3eeea137-21fe-4a6d-bd52-61599cb623aa', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 114.88, '2026-08-10', 'futura'),
('3eeea137-21fe-4a6d-bd52-61599cb623aa', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 114.88, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'cbe6f08f-0071-4cbe-8843-4d958b33d59b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('cbe6f08f-0071-4cbe-8843-4d958b33d59b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 74.66, '2026-07-13', 'futura'),
('cbe6f08f-0071-4cbe-8843-4d958b33d59b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 74.66, '2026-08-10', 'futura'),
('cbe6f08f-0071-4cbe-8843-4d958b33d59b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 74.68, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '0dfc41d7-38eb-431f-832f-ce382b7c117c';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('0dfc41d7-38eb-431f-832f-ce382b7c117c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 650.66, '2026-07-13', 'futura'),
('0dfc41d7-38eb-431f-832f-ce382b7c117c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 650.66, '2026-08-10', 'futura'),
('0dfc41d7-38eb-431f-832f-ce382b7c117c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 650.68, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '0a810586-afdd-4d29-97af-8dce7ced9301';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('0a810586-afdd-4d29-97af-8dce7ced9301', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 325.33, '2026-07-13', 'futura'),
('0a810586-afdd-4d29-97af-8dce7ced9301', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 325.33, '2026-08-10', 'futura'),
('0a810586-afdd-4d29-97af-8dce7ced9301', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 325.34, '2026-09-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'fb6f5efe-d212-4326-aa14-acd3448cba61';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('fb6f5efe-d212-4326-aa14-acd3448cba61', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1938.24, '2026-06-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a0452739-f34e-4856-a0d5-239017fc1265';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a0452739-f34e-4856-a0d5-239017fc1265', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 5575.68, '2026-08-04', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a984024e-0f30-416c-b59c-9f41febb041c';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a984024e-0f30-416c-b59c-9f41febb041c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 128, '2026-07-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = '33cf2c4a-5646-4903-8d29-d0022432774a';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('33cf2c4a-5646-4903-8d29-d0022432774a', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1120, '2026-07-15', 'futura'),
('33cf2c4a-5646-4903-8d29-d0022432774a', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 1120, '2026-08-14', 'futura'),
('33cf2c4a-5646-4903-8d29-d0022432774a', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 1120, '2026-09-14', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a7abee19-7219-4867-a30d-65c47aa48d4b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a7abee19-7219-4867-a30d-65c47aa48d4b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 672, '2026-07-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'bbdae907-f53b-44b4-b17e-d74c94bc5bc0';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('bbdae907-f53b-44b4-b17e-d74c94bc5bc0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 70.08, '2026-06-19', 'futura');
DELETE FROM parcelas WHERE pedido_id = '59d2fee4-25f0-4834-ae05-3185b870d5ed';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('59d2fee4-25f0-4834-ae05-3185b870d5ed', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 476.8, '2026-06-19', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'e0c55871-c040-4c15-89f0-b03c817c4841';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('e0c55871-c040-4c15-89f0-b03c817c4841', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 40.8, '2026-06-19', 'futura');
DELETE FROM parcelas WHERE pedido_id = '55541daf-f740-404f-8791-926d07af82bf';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('55541daf-f740-404f-8791-926d07af82bf', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 44.74, '2026-06-19', 'futura');
DELETE FROM parcelas WHERE pedido_id = '5e0ca44b-9483-4525-92fc-1be94bcd3fd7';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('5e0ca44b-9483-4525-92fc-1be94bcd3fd7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 56, '2026-06-19', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ab28351b-fdd6-4cbc-bf66-4699f9df8dab';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ab28351b-fdd6-4cbc-bf66-4699f9df8dab', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 142.4, '2026-06-19', 'futura');
DELETE FROM parcelas WHERE pedido_id = '2260b03d-2099-43ce-83ac-951c22a1a265';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('2260b03d-2099-43ce-83ac-951c22a1a265', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 56, '2026-06-19', 'futura');
DELETE FROM parcelas WHERE pedido_id = '59b740f9-f62f-46c3-a58c-70c0a8e7fe39';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('59b740f9-f62f-46c3-a58c-70c0a8e7fe39', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 254.4, '2026-06-19', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'abc4efac-d73e-49e1-bd68-9499cdb62500';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('abc4efac-d73e-49e1-bd68-9499cdb62500', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 112, '2026-06-19', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'd61eff6d-e1ef-4dd4-85c3-3c44c3b53d79';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('d61eff6d-e1ef-4dd4-85c3-3c44c3b53d79', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 115.14, '2026-06-19', 'futura');
DELETE FROM parcelas WHERE pedido_id = '828b7a97-46ff-4385-be6e-db4e89537e9d';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('828b7a97-46ff-4385-be6e-db4e89537e9d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 89.6, '2026-06-19', 'futura');
DELETE FROM parcelas WHERE pedido_id = '1c75b460-4c9d-443a-bc68-387e349f59e7';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('1c75b460-4c9d-443a-bc68-387e349f59e7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 5700, '2026-06-05', 'futura'),
('1c75b460-4c9d-443a-bc68-387e349f59e7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 5700, '2026-07-06', 'futura');
DELETE FROM parcelas WHERE pedido_id = '1af75441-168f-4b1a-9a07-4e8dce3899a3';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('1af75441-168f-4b1a-9a07-4e8dce3899a3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 500, '2026-06-05', 'futura'),
('1af75441-168f-4b1a-9a07-4e8dce3899a3', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 500, '2026-07-06', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'df5b1cc1-8044-4c7d-893c-d2e3587820c9';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('df5b1cc1-8044-4c7d-893c-d2e3587820c9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 600, '2026-06-05', 'futura'),
('df5b1cc1-8044-4c7d-893c-d2e3587820c9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 600, '2026-07-06', 'futura');
DELETE FROM parcelas WHERE pedido_id = '5deeb739-7e8a-4829-924f-f2e5b8d0274c';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('5deeb739-7e8a-4829-924f-f2e5b8d0274c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1060.68, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'ca952c13-796d-4571-86b1-31a7cd339f35';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('ca952c13-796d-4571-86b1-31a7cd339f35', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 600, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '1a2ff2fa-b7ae-4430-a79e-7cceff28d941';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('1a2ff2fa-b7ae-4430-a79e-7cceff28d941', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2000, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '72c8e54d-2c25-4c82-8a3f-94003b563d5d';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('72c8e54d-2c25-4c82-8a3f-94003b563d5d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 9980, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '9af7d1be-7d9c-4116-ad2f-ab9a3cbe2353';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('9af7d1be-7d9c-4116-ad2f-ab9a3cbe2353', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1856.19, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '19d29015-cd67-4802-923d-1fcd8083cd92';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('19d29015-cd67-4802-923d-1fcd8083cd92', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1554, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'd6388a1d-316a-4850-9fa3-b5e8142d4ef9';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('d6388a1d-316a-4850-9fa3-b5e8142d4ef9', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1072.22, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'b8cb0165-1ffb-4b84-8f42-be1e0acaa311';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('b8cb0165-1ffb-4b84-8f42-be1e0acaa311', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2226, '2026-05-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '82ed2476-e8d1-487b-859e-fc64f23b60c5';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('82ed2476-e8d1-487b-859e-fc64f23b60c5', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 629.7, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '94c30792-0820-4832-a50c-19799b26bb9b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('94c30792-0820-4832-a50c-19799b26bb9b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 938, '2026-05-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'e097b240-9d5b-4219-bc61-772a6df77ce8';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('e097b240-9d5b-4219-bc61-772a6df77ce8', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1876, '2026-05-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '94f79b12-4609-4ef0-8cd5-b8d2e19aab02';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('94f79b12-4609-4ef0-8cd5-b8d2e19aab02', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1876, '2026-05-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '7c28a46a-9e49-469f-ad1d-1a37b0b1dabb';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('7c28a46a-9e49-469f-ad1d-1a37b0b1dabb', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 459, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'aa3afc4f-765b-48f4-8697-e475b2f9870f';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('aa3afc4f-765b-48f4-8697-e475b2f9870f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 851.06, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '744d5093-2375-40c7-9d0d-7f392cba4e26';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('744d5093-2375-40c7-9d0d-7f392cba4e26', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 967.6, '2026-06-04', 'futura');
DELETE FROM parcelas WHERE pedido_id = '57761e44-465c-4111-9689-43c4059ba425';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('57761e44-465c-4111-9689-43c4059ba425', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 200, '2026-05-07', 'futura');
DELETE FROM parcelas WHERE pedido_id = '16e3a3b9-bf7c-453a-8584-94bb7b7a6626';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('16e3a3b9-bf7c-453a-8584-94bb7b7a6626', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 1194.66, '2026-05-26', 'futura'),
('16e3a3b9-bf7c-453a-8584-94bb7b7a6626', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 1194.66, '2026-06-09', 'futura'),
('16e3a3b9-bf7c-453a-8584-94bb7b7a6626', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 1194.68, '2026-06-23', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c908aea6-3cf0-44dc-9230-81b89984de06';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c908aea6-3cf0-44dc-9230-81b89984de06', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 561.6, '2026-05-11', 'futura');
DELETE FROM parcelas WHERE pedido_id = '9a14d79d-0e31-4eb7-bbc0-11e0258c028d';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('9a14d79d-0e31-4eb7-bbc0-11e0258c028d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 6180, '2026-05-29', 'futura'),
('9a14d79d-0e31-4eb7-bbc0-11e0258c028d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 6180, '2026-06-29', 'futura');
DELETE FROM parcelas WHERE pedido_id = '67b54995-2b90-44c8-85bb-a7d2638b33ed';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('67b54995-2b90-44c8-85bb-a7d2638b33ed', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 6180, '2026-05-29', 'futura'),
('67b54995-2b90-44c8-85bb-a7d2638b33ed', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 6180, '2026-06-29', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'e42f9605-f570-4832-a861-80ab8b5b794f';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('e42f9605-f570-4832-a861-80ab8b5b794f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 3090, '2026-05-29', 'futura'),
('e42f9605-f570-4832-a861-80ab8b5b794f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 3090, '2026-06-29', 'futura');
DELETE FROM parcelas WHERE pedido_id = '30b77d8b-d591-42e5-9cbc-11c5546b962f';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('30b77d8b-d591-42e5-9cbc-11c5546b962f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 5120, '2026-05-29', 'futura'),
('30b77d8b-d591-42e5-9cbc-11c5546b962f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 5120, '2026-06-29', 'futura');
DELETE FROM parcelas WHERE pedido_id = '5fd7495b-1bfb-49a0-9bbb-7d02d6fc3df4';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('5fd7495b-1bfb-49a0-9bbb-7d02d6fc3df4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 51.78, '2026-06-08', 'futura'),
('5fd7495b-1bfb-49a0-9bbb-7d02d6fc3df4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 51.78, '2026-06-22', 'futura'),
('5fd7495b-1bfb-49a0-9bbb-7d02d6fc3df4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 51.8, '2026-07-06', 'futura');
DELETE FROM parcelas WHERE pedido_id = '473db87f-338a-47f4-b10b-652c0be1c75b';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('473db87f-338a-47f4-b10b-652c0be1c75b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2429.75, '2026-06-04', 'futura'),
('473db87f-338a-47f4-b10b-652c0be1c75b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2429.75, '2026-07-02', 'futura'),
('473db87f-338a-47f4-b10b-652c0be1c75b', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2429.75, '2026-07-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'a6971dcf-fc32-4455-bbd1-01bf643448ab';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('a6971dcf-fc32-4455-bbd1-01bf643448ab', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 554.66, '2026-06-04', 'futura'),
('a6971dcf-fc32-4455-bbd1-01bf643448ab', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 554.66, '2026-06-18', 'futura'),
('a6971dcf-fc32-4455-bbd1-01bf643448ab', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 554.68, '2026-07-02', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'edf8aa2a-9efd-4ee2-8112-f335ab98c8f4';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('edf8aa2a-9efd-4ee2-8112-f335ab98c8f4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 197.12, '2026-06-04', 'futura'),
('edf8aa2a-9efd-4ee2-8112-f335ab98c8f4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 197.12, '2026-06-18', 'futura'),
('edf8aa2a-9efd-4ee2-8112-f335ab98c8f4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 197.12, '2026-07-02', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'de78c5ea-9671-4c5a-89ef-ad16d792a843';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('de78c5ea-9671-4c5a-89ef-ad16d792a843', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 67.2, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = '2efff4d7-eb5e-47ac-8491-8fd516c22e6e';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('2efff4d7-eb5e-47ac-8491-8fd516c22e6e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 4414.96, '2026-06-04', 'futura'),
('2efff4d7-eb5e-47ac-8491-8fd516c22e6e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 4414.96, '2026-07-02', 'futura'),
('2efff4d7-eb5e-47ac-8491-8fd516c22e6e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 4414.96, '2026-07-30', 'futura');
DELETE FROM parcelas WHERE pedido_id = '1a382c1b-0209-4dec-a2f9-64b8094705f5';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('1a382c1b-0209-4dec-a2f9-64b8094705f5', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 920, '2026-06-04', 'futura'),
('1a382c1b-0209-4dec-a2f9-64b8094705f5', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 920, '2026-06-18', 'futura'),
('1a382c1b-0209-4dec-a2f9-64b8094705f5', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 920, '2026-07-02', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'f9aea348-9858-409d-bef9-2c6f034f32b6';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('f9aea348-9858-409d-bef9-2c6f034f32b6', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 429.33, '2026-06-04', 'futura'),
('f9aea348-9858-409d-bef9-2c6f034f32b6', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 429.33, '2026-06-18', 'futura'),
('f9aea348-9858-409d-bef9-2c6f034f32b6', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 429.34, '2026-07-02', 'futura');
DELETE FROM parcelas WHERE pedido_id = '8aa488d1-3d89-4116-8928-0a8e3bd71385';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('8aa488d1-3d89-4116-8928-0a8e3bd71385', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 201.6, '2026-06-22', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'e87380e5-9042-42cc-a0e2-89a3cb9c2b14';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('e87380e5-9042-42cc-a0e2-89a3cb9c2b14', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 51.78, '2026-06-08', 'futura'),
('e87380e5-9042-42cc-a0e2-89a3cb9c2b14', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 51.78, '2026-06-22', 'futura'),
('e87380e5-9042-42cc-a0e2-89a3cb9c2b14', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 51.8, '2026-07-06', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'd1ee2872-fd02-46f9-893a-eb73423fbc3e';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('d1ee2872-fd02-46f9-893a-eb73423fbc3e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 2429.75, '2026-06-18', 'futura'),
('d1ee2872-fd02-46f9-893a-eb73423fbc3e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 2429.75, '2026-07-16', 'futura'),
('d1ee2872-fd02-46f9-893a-eb73423fbc3e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 2429.75, '2026-08-13', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'f99dc89e-bcb2-4b03-acaf-3fad07fb9c6d';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('f99dc89e-bcb2-4b03-acaf-3fad07fb9c6d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 554.66, '2026-06-18', 'futura'),
('f99dc89e-bcb2-4b03-acaf-3fad07fb9c6d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 554.66, '2026-07-02', 'futura'),
('f99dc89e-bcb2-4b03-acaf-3fad07fb9c6d', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 554.68, '2026-07-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = '8267aabc-b093-4de8-83fe-959b6fa129d2';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('8267aabc-b093-4de8-83fe-959b6fa129d2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 197.12, '2026-06-18', 'futura'),
('8267aabc-b093-4de8-83fe-959b6fa129d2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 197.12, '2026-07-02', 'futura'),
('8267aabc-b093-4de8-83fe-959b6fa129d2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 197.12, '2026-07-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = '140c4c10-0668-4e99-a959-38caaab128c7';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('140c4c10-0668-4e99-a959-38caaab128c7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 67.2, '2026-07-06', 'futura');
DELETE FROM parcelas WHERE pedido_id = '7aa3ffce-b87b-49fe-8605-bfae307175fe';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('7aa3ffce-b87b-49fe-8605-bfae307175fe', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 4414.96, '2026-06-18', 'futura'),
('7aa3ffce-b87b-49fe-8605-bfae307175fe', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 4414.96, '2026-07-16', 'futura'),
('7aa3ffce-b87b-49fe-8605-bfae307175fe', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 4414.96, '2026-08-13', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'd4fc82e2-058a-4fa0-8af7-96179e388b4e';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('d4fc82e2-058a-4fa0-8af7-96179e388b4e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 920, '2026-06-18', 'futura'),
('d4fc82e2-058a-4fa0-8af7-96179e388b4e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 920, '2026-07-02', 'futura'),
('d4fc82e2-058a-4fa0-8af7-96179e388b4e', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 920, '2026-07-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = '8a75ce97-e8a2-48f8-9831-f5fd42ad59a2';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('8a75ce97-e8a2-48f8-9831-f5fd42ad59a2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 429.33, '2026-06-18', 'futura'),
('8a75ce97-e8a2-48f8-9831-f5fd42ad59a2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 429.33, '2026-07-02', 'futura'),
('8a75ce97-e8a2-48f8-9831-f5fd42ad59a2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 3, 429.34, '2026-07-16', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'edf3c496-5e60-467f-83d9-f43670ca0395';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('edf3c496-5e60-467f-83d9-f43670ca0395', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 201.6, '2026-07-06', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'b38ea7cf-25f1-47a6-9c86-23d9e0a9ecb2';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('b38ea7cf-25f1-47a6-9c86-23d9e0a9ecb2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 31200, '2026-04-06', 'futura'),
('b38ea7cf-25f1-47a6-9c86-23d9e0a9ecb2', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 31200, '2026-05-21', 'futura');
DELETE FROM parcelas WHERE pedido_id = '569b969d-e3ea-4a18-b3bd-e31fc471bd0c';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('569b969d-e3ea-4a18-b3bd-e31fc471bd0c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 960, '2026-06-02', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'db65f592-3d2f-400a-a2ee-4b9f685816ed';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('db65f592-3d2f-400a-a2ee-4b9f685816ed', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 960, '2026-06-17', 'futura');
DELETE FROM parcelas WHERE pedido_id = '5efd2302-579c-4c06-8b69-3760bbdab5f0';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('5efd2302-579c-4c06-8b69-3760bbdab5f0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 21750, '2026-04-09', 'futura'),
('5efd2302-579c-4c06-8b69-3760bbdab5f0', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 21750, '2026-05-25', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'bdc7a5ba-d447-4f03-9e00-9c13db8c919c';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('bdc7a5ba-d447-4f03-9e00-9c13db8c919c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 18125, '2026-04-17', 'futura'),
('bdc7a5ba-d447-4f03-9e00-9c13db8c919c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 18125, '2026-06-01', 'futura');
DELETE FROM parcelas WHERE pedido_id = '8643fbbe-0a4c-4465-b7dc-9a46c0c1e5e7';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('8643fbbe-0a4c-4465-b7dc-9a46c0c1e5e7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 18125, '2026-04-29', 'futura'),
('8643fbbe-0a4c-4465-b7dc-9a46c0c1e5e7', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 18125, '2026-06-12', 'futura');
DELETE FROM parcelas WHERE pedido_id = '2445ca7a-6399-4634-ae43-0277223a821c';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('2445ca7a-6399-4634-ae43-0277223a821c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 24000, '2026-06-01', 'futura'),
('2445ca7a-6399-4634-ae43-0277223a821c', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 24000, '2026-07-01', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'bcd69d9d-a1c3-4c69-b368-a48f705620f4';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('bcd69d9d-a1c3-4c69-b368-a48f705620f4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 24000, '2026-06-15', 'futura'),
('bcd69d9d-a1c3-4c69-b368-a48f705620f4', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 24000, '2026-07-15', 'futura');
DELETE FROM parcelas WHERE pedido_id = '4e0ba3f6-116b-4284-b35e-a96395840e2f';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('4e0ba3f6-116b-4284-b35e-a96395840e2f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 640, '2026-05-11', 'futura'),
('4e0ba3f6-116b-4284-b35e-a96395840e2f', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 640, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = '6ee90e41-467c-4d5f-b80e-7f87169e9258';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('6ee90e41-467c-4d5f-b80e-7f87169e9258', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 488, '2026-05-11', 'futura'),
('6ee90e41-467c-4d5f-b80e-7f87169e9258', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 488, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = '386aaf91-00b8-43aa-9ea5-db8741c431bb';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('386aaf91-00b8-43aa-9ea5-db8741c431bb', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 640, '2026-05-11', 'futura'),
('386aaf91-00b8-43aa-9ea5-db8741c431bb', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 640, '2026-06-08', 'futura');
DELETE FROM parcelas WHERE pedido_id = 'c0b181a4-fd55-4154-9c04-79c5481d7250';
INSERT INTO parcelas (pedido_id, company_id, numero_parcela, valor, data_vencimento, status) VALUES
('c0b181a4-fd55-4154-9c04-79c5481d7250', '54e7018a-5475-4132-a15d-913b1d28d5d0', 1, 488, '2026-05-11', 'futura'),
('c0b181a4-fd55-4154-9c04-79c5481d7250', '54e7018a-5475-4132-a15d-913b1d28d5d0', 2, 488, '2026-06-08', 'futura');

COMMIT;
