

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+06:00";
--
-- Database: `hospital_management`
--

-- --------------------------------------------------------

--
-- Table structure for table `appointments`
--

CREATE TABLE `appointments` (
  `id` int(11) NOT NULL,
  `appointmentDate` date NOT NULL,
  `appointmentTime` time NOT NULL,
  `status` enum('scheduled','completed','cancelled') DEFAULT 'scheduled',
  `billingStatus` enum('billed','not_billed') DEFAULT 'not_billed',
  `remarks` text DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `PatientId` int(11) DEFAULT NULL,
  `DoctorId` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `billings`
--

CREATE TABLE `billings` (
  `id` int(11) NOT NULL,
  `billNumber` varchar(255) NOT NULL,
  `billDate` date NOT NULL,
  `billdelivaridate` date DEFAULT NULL,
  `totalAmount` decimal(10,2) NOT NULL,
  `discountPercentage` decimal(5,2) DEFAULT 0.00,
  `discountAmount` decimal(10,2) DEFAULT 0.00,
  `netPayable` decimal(10,2) NOT NULL,
  `paymentMethod` enum('cash','card','insurance') NOT NULL DEFAULT 'cash',
  `paidAmount` decimal(10,2) DEFAULT 0.00,
  `dueAmount` decimal(10,2) DEFAULT 0.00,
  `status` enum('paid','due') DEFAULT 'due',
  `items` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`items`)),
  `marketingManagerId` int(11) DEFAULT NULL,
  `marketingcommission` decimal(10,2) DEFAULT 0.00,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `PatientId` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cabinbookings`
--

CREATE TABLE `cabinbookings` (
  `id` int(11) NOT NULL,
  `admissionDate` date NOT NULL,
  `dischargeDate` date DEFAULT NULL,
  `expectedStay` int(11) DEFAULT 1,
  `dailyRate` decimal(10,2) NOT NULL,
  `status` enum('active','discharged','cancelled') DEFAULT 'active',
  `billingStatus` enum('billed','not_billed') DEFAULT 'not_billed',
  `remarks` text DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `PatientId` int(11) DEFAULT NULL,
  `CabinId` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cabins`
--

CREATE TABLE `cabins` (
  `id` int(11) NOT NULL,
  `cabinNumber` varchar(255) NOT NULL,
  `cabinType` enum('VIP','Deluxe','Regular') NOT NULL,
  `pricePerDay` decimal(10,2) NOT NULL,
  `status` enum('Available','Occupied','Maintenance') DEFAULT 'Available',
  `description` text DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `doctorcommissions`
--

CREATE TABLE `doctorcommissions` (
  `id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `status` enum('pending','paid') DEFAULT 'pending',
  `paidDate` date DEFAULT NULL,
  `commissionDate` date NOT NULL,
  `notes` text DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `DoctorId` int(11) DEFAULT NULL,
  `TestId` int(11) DEFAULT NULL,
  `TestRequestId` int(11) DEFAULT NULL,
  `BillingId` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `doctors`
--

CREATE TABLE `doctors` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `specialization` varchar(255) NOT NULL,
  `qualification` varchar(255) NOT NULL,
  `phone` varchar(255) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `consultationFee` decimal(10,2) NOT NULL,
  `isAvailable` tinyint(1) DEFAULT 1,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `featurepermissions`
--

CREATE TABLE `featurepermissions` (
  `id` int(11) NOT NULL,
  `moduleName` varchar(255) NOT NULL DEFAULT 'Billing',
  `featureName` varchar(255) NOT NULL,
  `isVisible` tinyint(1) DEFAULT 1,
  `roles` text NOT NULL,
  `updatedBy` int(11) DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `marketingcommissions`
--

CREATE TABLE `marketingcommissions` (
  `id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `commissionPercentage` decimal(5,2) NOT NULL DEFAULT 0.00,
  `status` enum('pending','paid') DEFAULT 'pending',
  `paidDate` date DEFAULT NULL,
  `commissionDate` date NOT NULL,
  `notes` text DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `marketingManagerId` int(11) DEFAULT NULL,
  `BillingId` int(11) DEFAULT NULL,
  `PatientId` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `patients`
--

CREATE TABLE `patients` (
  `id` int(11) NOT NULL,
  `patientId` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `gender` enum('male','female','other') NOT NULL,
  `dateOfBirth` date NOT NULL,
  `phone` varchar(255) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `bloodGroup` enum('A+','A-','B+','B-','AB+','AB-','O+','O-') DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sessions`
--

CREATE TABLE `sessions` (
  `sid` varchar(36) NOT NULL,
  `expires` datetime DEFAULT NULL,
  `data` text DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `settings`
--

CREATE TABLE `settings` (
  `id` int(11) NOT NULL,
  `medical_name` varchar(255) NOT NULL,
  `address` text DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `favicon_path` varchar(255) DEFAULT NULL,
  `import_tast_data` tinyint(1) NOT NULL DEFAULT 0,
  `import_feature_data` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `testrequests`
--

CREATE TABLE `testrequests` (
  `id` int(11) NOT NULL,
  `requestDate` date NOT NULL,
  `priority` enum('Normal','Urgent') DEFAULT 'Normal',
  `status` enum('Pending','In Progress','Completed','Delivered','Cancelled') DEFAULT 'Pending',
  `resultFile` text DEFAULT NULL COMMENT 'JSON string of file paths or single path',
  `resultNotes` text DEFAULT NULL,
  `completedDate` datetime DEFAULT NULL,
  `billingStatus` enum('billed','not_billed') DEFAULT 'not_billed',
  `deliveryOption` enum('Not Collected','Collect','Email','Home Delivery') DEFAULT 'Not Collected',
  `deliveryDate` date DEFAULT NULL,
  `commission` decimal(10,2) NOT NULL DEFAULT 0.00,
  `notes` text DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `PatientId` int(11) DEFAULT NULL,
  `TestId` int(11) DEFAULT NULL,
  `DoctorId` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tests`
--

CREATE TABLE `tests` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `description` text DEFAULT NULL,
  `commission` decimal(10,2) NOT NULL DEFAULT 0.00,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `username` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `role` enum('softadmin','admin','receptionist','doctor','laboratorist','nurse','marketing') NOT NULL,
  `isActive` tinyint(1) DEFAULT 1,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `username`, `password`, `email`, `role`, `isActive`, `createdAt`, `updatedAt`) VALUES
(1, 'softadmin', '$2a$10$hymTBtQH6fcu8DjlmH4s9uAo/hBHbai2meUaeD9xCee4oZ4HZTx3W', 'softadmin@hospital.com', 'softadmin', 1, '2025-05-12 11:31:24', '2025-05-12 11:31:24');


INSERT INTO `users` (`id`, `username`, `password`, `email`, `role`, `isActive`, `createdAt`, `updatedAt`) VALUES
(2, 'admin', '$2a$10$hymTBtQH6fcu8DjlmH4s9uAo/hBHbai2meUaeD9xCee4oZ4HZTx3W', 'admin@hospital.com', 'admin', 1, '2025-05-12 11:31:24', '2025-05-12 11:31:24');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `appointments`
--
ALTER TABLE `appointments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `PatientId` (`PatientId`),
  ADD KEY `DoctorId` (`DoctorId`);

--
-- Indexes for table `billings`
--
ALTER TABLE `billings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `billNumber` (`billNumber`),
  ADD KEY `marketingManagerId` (`marketingManagerId`),
  ADD KEY `PatientId` (`PatientId`);

--
-- Indexes for table `cabinbookings`
--
ALTER TABLE `cabinbookings`
  ADD PRIMARY KEY (`id`),
  ADD KEY `PatientId` (`PatientId`),
  ADD KEY `CabinId` (`CabinId`);

--
-- Indexes for table `cabins`
--
ALTER TABLE `cabins`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `cabinNumber` (`cabinNumber`);

--
-- Indexes for table `doctorcommissions`
--
ALTER TABLE `doctorcommissions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `DoctorId` (`DoctorId`),
  ADD KEY `TestId` (`TestId`),
  ADD KEY `TestRequestId` (`TestRequestId`),
  ADD KEY `BillingId` (`BillingId`);

--
-- Indexes for table `doctors`
--
ALTER TABLE `doctors`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `featurepermissions`
--
ALTER TABLE `featurepermissions`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `marketingcommissions`
--
ALTER TABLE `marketingcommissions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `marketingManagerId` (`marketingManagerId`),
  ADD KEY `BillingId` (`BillingId`),
  ADD KEY `PatientId` (`PatientId`);

--
-- Indexes for table `patients`
--
ALTER TABLE `patients`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `patientId` (`patientId`);

--
-- Indexes for table `sessions`
--
ALTER TABLE `sessions`
  ADD PRIMARY KEY (`sid`);

--
-- Indexes for table `settings`
--
ALTER TABLE `settings`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `testrequests`
--
ALTER TABLE `testrequests`
  ADD PRIMARY KEY (`id`),
  ADD KEY `PatientId` (`PatientId`),
  ADD KEY `TestId` (`TestId`),
  ADD KEY `DoctorId` (`DoctorId`);

--
-- Indexes for table `tests`
--
ALTER TABLE `tests`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `email` (`email`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `appointments`
--
ALTER TABLE `appointments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `billings`
--
ALTER TABLE `billings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cabinbookings`
--
ALTER TABLE `cabinbookings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cabins`
--
ALTER TABLE `cabins`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `doctorcommissions`
--
ALTER TABLE `doctorcommissions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `doctors`
--
ALTER TABLE `doctors`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `featurepermissions`
--
ALTER TABLE `featurepermissions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `marketingcommissions`
--
ALTER TABLE `marketingcommissions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `patients`
--
ALTER TABLE `patients`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `settings`
--
ALTER TABLE `settings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `testrequests`
--
ALTER TABLE `testrequests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tests`
--
ALTER TABLE `tests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `appointments`
--
ALTER TABLE `appointments`
  ADD CONSTRAINT `appointments_ibfk_1` FOREIGN KEY (`PatientId`) REFERENCES `patients` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `appointments_ibfk_2` FOREIGN KEY (`DoctorId`) REFERENCES `doctors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `billings`
--
ALTER TABLE `billings`
  ADD CONSTRAINT `billings_ibfk_1` FOREIGN KEY (`marketingManagerId`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `billings_ibfk_2` FOREIGN KEY (`PatientId`) REFERENCES `patients` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `cabinbookings`
--
ALTER TABLE `cabinbookings`
  ADD CONSTRAINT `cabinbookings_ibfk_1` FOREIGN KEY (`PatientId`) REFERENCES `patients` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `cabinbookings_ibfk_2` FOREIGN KEY (`CabinId`) REFERENCES `cabins` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `doctorcommissions`
--
ALTER TABLE `doctorcommissions`
  ADD CONSTRAINT `doctorcommissions_ibfk_1` FOREIGN KEY (`DoctorId`) REFERENCES `doctors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `doctorcommissions_ibfk_2` FOREIGN KEY (`TestId`) REFERENCES `tests` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `doctorcommissions_ibfk_3` FOREIGN KEY (`TestRequestId`) REFERENCES `testrequests` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `doctorcommissions_ibfk_4` FOREIGN KEY (`BillingId`) REFERENCES `billings` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `marketingcommissions`
--
ALTER TABLE `marketingcommissions`
  ADD CONSTRAINT `marketingcommissions_ibfk_1` FOREIGN KEY (`marketingManagerId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `marketingcommissions_ibfk_2` FOREIGN KEY (`BillingId`) REFERENCES `billings` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `marketingcommissions_ibfk_3` FOREIGN KEY (`PatientId`) REFERENCES `patients` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `testrequests`
--
ALTER TABLE `testrequests`
  ADD CONSTRAINT `testrequests_ibfk_1` FOREIGN KEY (`PatientId`) REFERENCES `patients` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `testrequests_ibfk_2` FOREIGN KEY (`TestId`) REFERENCES `tests` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `testrequests_ibfk_3` FOREIGN KEY (`DoctorId`) REFERENCES `doctors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;

