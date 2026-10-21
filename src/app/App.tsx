import { Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import ScreenLayout from '../layouts/ScreenLayout';
import { RequireModule } from '../layouts/RequireModule';
import CampusOverviewPage from '../pages/dashboard/CampusOverviewPage';
import CampusDetailPage from '../pages/dashboard/CampusDetailPage';
import EnergyScreenPage from '../pages/dashboard/EnergyScreenPage';
import ElectricityMonitorPage from '../pages/monitoring/ElectricityMonitorPage';
import WaterMonitorPage from '../pages/monitoring/WaterMonitorPage';
import GasMonitorPage from '../pages/monitoring/GasMonitorPage';
import ThermalMonitorPage from '../pages/monitoring/ThermalMonitorPage';
import BuildingDetailPage from '../pages/monitoring/BuildingDetailPage';
import EquipmentMonitorPage from '../pages/monitoring/EquipmentMonitorPage';
import AnalysisOverviewPage from '../pages/analytics/OverviewPage';
import AnalysisCategoriesPage from '../pages/analytics/CategoriesPage';
import AnalysisBuildingsPage from '../pages/analytics/BuildingsPage';
import AnalysisComparisonPage from '../pages/analytics/ComparisonPage';
import AnalysisCalendarPage from '../pages/analytics/CalendarAnalysisPage';
import AnalysisBalancePage from '../pages/analytics/BalancePage';
import ScenarioTeachingPage from '../pages/scenarios/TeachingPage';
import ScenarioLaboratoryPage from '../pages/scenarios/LaboratoryPage';
import ScenarioDormitoryPage from '../pages/scenarios/DormitoryPage';
import ScenarioDiningPage from '../pages/scenarios/DiningPage';
import ScenarioLibrarySportsPage from '../pages/scenarios/LibrarySportsPage';
import ScenarioPublicPage from '../pages/scenarios/PublicFacilitiesPage';
import ScenarioDepartmentsPage from '../pages/scenarios/DepartmentsPage';
import ScenarioPlantPage from '../pages/scenarios/PlantPage';
import CostsOverviewPage from '../pages/costs/CostsOverviewPage';
import CostsPricingPage from '../pages/costs/PricingPage';
import CostsBillsPage from '../pages/costs/BillsPage';
import CostsAllocationPage from '../pages/costs/AllocationPage';
import CostsBudgetPage from '../pages/costs/BudgetPage';
import AlarmCenterPage from '../pages/alarms/AlarmCenterPage';
import AlarmDetailPage from '../pages/alarms/AlarmDetailPage';
import AlarmRulesPage from '../pages/alarms/AlarmRulesPage';
import WorkOrdersPage from '../pages/alarms/WorkOrdersPage';
import ReportsPage from '../pages/reports/ReportsPage';
import PublicInstitutionsPage from '../pages/reports/PublicInstitutionsPage';
import EfficiencyTargetsPage from '../pages/efficiency/TargetsPage';
import EfficiencyProjectsPage from '../pages/efficiency/ProjectsPage';
import EfficiencyEvaluationPage from '../pages/efficiency/EvaluationPage';
import FoundationBuildingsPage from '../pages/foundation/BuildingsPage';
import FoundationDepartmentsPage from '../pages/foundation/DepartmentsPage';
import FoundationCalendarPage from '../pages/foundation/CalendarPage';
import FoundationMetersPage from '../pages/foundation/MetersPage';
import FoundationMeteringPage from '../pages/foundation/MeteringPage';
import FoundationDataQualityPage from '../pages/foundation/DataQualityPage';
import SystemUsersPage from '../pages/system/UsersPage';
import SystemIntegrationsPage from '../pages/system/IntegrationsPage';
import SystemAuditPage from '../pages/system/AuditPage';
import NotFoundPage from '../pages/NotFoundPage';

export function AppRouter() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Navigate to="/dashboard/campus" replace />} />
        <Route path="/dashboard/campus" element={<RequireModule module="dashboard"><CampusOverviewPage /></RequireModule>} />
        <Route path="/dashboard/campus/:campusId" element={<RequireModule module="dashboard"><CampusDetailPage /></RequireModule>} />
        <Route path="/monitor/electricity" element={<RequireModule module="monitoring"><ElectricityMonitorPage /></RequireModule>} />
        <Route path="/monitor/water" element={<RequireModule module="monitoring"><WaterMonitorPage /></RequireModule>} />
        <Route path="/monitor/gas" element={<RequireModule module="monitoring"><GasMonitorPage /></RequireModule>} />
        <Route path="/monitor/thermal" element={<RequireModule module="monitoring"><ThermalMonitorPage /></RequireModule>} />
        <Route path="/monitor/equipment" element={<RequireModule module="monitoring"><EquipmentMonitorPage /></RequireModule>} />
        <Route path="/monitor/building/:buildingId" element={<RequireModule module="monitoring"><BuildingDetailPage /></RequireModule>} />
        <Route path="/analysis/overview" element={<RequireModule module="analytics"><AnalysisOverviewPage /></RequireModule>} />
        <Route path="/analysis/categories" element={<RequireModule module="analytics"><AnalysisCategoriesPage /></RequireModule>} />
        <Route path="/analysis/buildings" element={<RequireModule module="analytics"><AnalysisBuildingsPage /></RequireModule>} />
        <Route path="/analysis/comparison" element={<RequireModule module="analytics"><AnalysisComparisonPage /></RequireModule>} />
        <Route path="/analysis/calendar" element={<RequireModule module="analytics"><AnalysisCalendarPage /></RequireModule>} />
        <Route path="/analysis/balance" element={<RequireModule module="analytics"><AnalysisBalancePage /></RequireModule>} />
        <Route path="/scenarios/teaching" element={<RequireModule module="scenarios"><ScenarioTeachingPage /></RequireModule>} />
        <Route path="/scenarios/laboratory" element={<RequireModule module="scenarios"><ScenarioLaboratoryPage /></RequireModule>} />
        <Route path="/scenarios/dormitory" element={<RequireModule module="scenarios"><ScenarioDormitoryPage /></RequireModule>} />
        <Route path="/scenarios/dining" element={<RequireModule module="scenarios"><ScenarioDiningPage /></RequireModule>} />
        <Route path="/scenarios/library-sports" element={<RequireModule module="scenarios"><ScenarioLibrarySportsPage /></RequireModule>} />
        <Route path="/scenarios/public" element={<RequireModule module="scenarios"><ScenarioPublicPage /></RequireModule>} />
        <Route path="/scenarios/departments" element={<RequireModule module="scenarios"><ScenarioDepartmentsPage /></RequireModule>} />
        <Route path="/scenarios/plant" element={<RequireModule module="scenarios"><ScenarioPlantPage /></RequireModule>} />
        <Route path="/costs/overview" element={<RequireModule module="costs"><CostsOverviewPage /></RequireModule>} />
        <Route path="/costs/pricing" element={<RequireModule module="costs"><CostsPricingPage /></RequireModule>} />
        <Route path="/costs/bills" element={<RequireModule module="costs"><CostsBillsPage /></RequireModule>} />
        <Route path="/costs/allocation" element={<RequireModule module="costs"><CostsAllocationPage /></RequireModule>} />
        <Route path="/costs/budget" element={<RequireModule module="costs"><CostsBudgetPage /></RequireModule>} />
        <Route path="/alarms" element={<RequireModule module="alarms"><AlarmCenterPage /></RequireModule>} />
        <Route path="/alarms/rules" element={<RequireModule module="alarms"><AlarmRulesPage /></RequireModule>} />
        <Route path="/alarms/:alertId" element={<RequireModule module="alarms"><AlarmDetailPage /></RequireModule>} />
        <Route path="/work-orders" element={<RequireModule module="alarms"><WorkOrdersPage /></RequireModule>} />
        <Route path="/reports" element={<RequireModule module="reports"><ReportsPage /></RequireModule>} />
        <Route path="/reports/public-institutions" element={<RequireModule module="reports"><PublicInstitutionsPage /></RequireModule>} />
        <Route path="/efficiency/targets" element={<RequireModule module="efficiency"><EfficiencyTargetsPage /></RequireModule>} />
        <Route path="/efficiency/projects" element={<RequireModule module="efficiency"><EfficiencyProjectsPage /></RequireModule>} />
        <Route path="/efficiency/evaluation" element={<RequireModule module="efficiency"><EfficiencyEvaluationPage /></RequireModule>} />
        <Route path="/base/buildings" element={<RequireModule module="foundation"><FoundationBuildingsPage /></RequireModule>} />
        <Route path="/base/departments" element={<RequireModule module="foundation"><FoundationDepartmentsPage /></RequireModule>} />
        <Route path="/base/calendar" element={<RequireModule module="foundation"><FoundationCalendarPage /></RequireModule>} />
        <Route path="/base/meters" element={<RequireModule module="foundation"><FoundationMetersPage /></RequireModule>} />
        <Route path="/base/metering" element={<RequireModule module="foundation"><FoundationMeteringPage /></RequireModule>} />
        <Route path="/base/data-quality" element={<RequireModule module="foundation"><FoundationDataQualityPage /></RequireModule>} />
        <Route path="/system/users" element={<RequireModule module="system"><SystemUsersPage /></RequireModule>} />
        <Route path="/system/integrations" element={<RequireModule module="system"><SystemIntegrationsPage /></RequireModule>} />
        <Route path="/system/audit" element={<RequireModule module="system"><SystemAuditPage /></RequireModule>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route element={<ScreenLayout />}>
        <Route path="/dashboard/energy" element={<RequireModule module="dashboard"><EnergyScreenPage /></RequireModule>} />
      </Route>
    </Routes>
  );
}