import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
	getDistanceKm,
	getPopulationEquivalent,
	getSupplyPlanningRole,
	supplyPlanningAllocationKey,
	type SupplyPlanningScenarioResults,
	type SupplyPlanningTank
} from "@/components/map/supply-planning";
import type {
	SupplyPlanningScenario,
	SupplyPlanningScenarioSummary
} from "@/lib/api";
import type { WaterBalanceLoadStatus } from "@/components/map/useTankWaterBalances";
import type { TankServiceGroup } from "@/components/map/useTankServiceAreas";
import type { LayerStatus } from "@/components/map/layers";

export type SupplyPlanningTankOption = SupplyPlanningTank & {
	waterSupply: number | null;
	waterSupplyPopulation: number | null;
	waterDemand: number | null;
};

export type SupplyPlanningSelectionStatus =
	| "idle"
	| "loading"
	| "loaded"
	| "saving"
	| "error";

type SupplyByPlanningPanelProps = {
	status: WaterBalanceLoadStatus;
	tankLayerStatus: LayerStatus;
	error: string | null;
	tanks: SupplyPlanningTankOption[];
	tankServiceGroups: Map<string, TankServiceGroup>;
	receiverIds: string[];
	supplierIds: string[];
	allocations: Record<string, number>;
	results: SupplyPlanningScenarioResults;
	radiusKm: number;
	selectionNotice: string | null;
	onToggleReceiver: (tankId: string) => void;
	onToggleSupplier: (tankId: string) => void;
	onAllocationChange: (key: string, population: number) => void;
	onRadiusChange: (radiusKm: number) => void;
	onClear: () => void;
	scenarios: SupplyPlanningScenarioSummary[];
	activeScenario: SupplyPlanningScenario | null;
	selectedScenarioId: string;
	onSelectScenario: (scenarioId: string) => void;
	onLoadScenario: () => void;
	onCreateDraft: () => void;
	onSaveScenario: () => void;
	onEditScenario: () => void;
	onDuplicateScenario: () => void;
	onRenameScenario: () => void;
	onDeleteScenario: () => void;
	onDraftNameChange: (name: string) => void;
	onDraftDescriptionChange: (description: string) => void;
	draftName: string;
	draftDescription: string;
	editingScenarioId: string | null;
	saveStatus: SupplyPlanningSelectionStatus;
	saveError: string | null;
	comparisonIds: string[];
	onToggleComparison: (scenarioId: string) => void;
	scenarioMapView: boolean;
	onToggleScenarioMap: (enabled: boolean) => void;
	showAllocationConnections: boolean;
	onToggleAllocationConnections: (enabled: boolean) => void;
	showScenarioServiceAreas: boolean;
	onToggleScenarioServiceAreas: (enabled: boolean) => void;
	onSelectTankResult: (tankId: string) => void;
	onSelectAllocation: (allocationIndex: number) => void;
};

const formatNumber = (value: number, digits = 1) =>
	value.toLocaleString(undefined, { maximumFractionDigits: digits });

const numeric = (value: number | string | null | undefined) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
};

const getAssignedPopulation = (
	allocations: Record<string, number>,
	tankId: string,
	tankIndex: 0 | 1,
	excludedKey?: string
) =>
	Object.entries(allocations).reduce((total, [key, value]) => {
		try {
			const pair: unknown = JSON.parse(key);
			return Array.isArray(pair) &&
				pair[tankIndex] === tankId &&
				key !== excludedKey ?
					total + Math.max(0, value)
				:	total;
		} catch {
			return total;
		}
	}, 0);

function SupplyByPlanningPanel({
	status,
	tankLayerStatus,
	error,
	tanks,
	tankServiceGroups,
	receiverIds,
	supplierIds,
	allocations,
	results,
	radiusKm,
	selectionNotice,
	onToggleReceiver,
	onToggleSupplier,
	onAllocationChange,
	onRadiusChange,
	onClear,
	scenarios,
	activeScenario,
	selectedScenarioId,
	onSelectScenario,
	onLoadScenario,
	onCreateDraft,
	onSaveScenario,
	onEditScenario,
	onDuplicateScenario,
	onRenameScenario,
	onDeleteScenario,
	onDraftNameChange,
	onDraftDescriptionChange,
	draftName,
	draftDescription,
	editingScenarioId,
	saveStatus,
	saveError,
	comparisonIds,
	onToggleComparison,
	scenarioMapView,
	onToggleScenarioMap,
	showAllocationConnections,
	onToggleAllocationConnections,
	showScenarioServiceAreas,
	onToggleScenarioServiceAreas,
	onSelectTankResult,
	onSelectAllocation
}: SupplyByPlanningPanelProps) {
	const tanksById = useMemo(
		() => new Map(tanks.map((tank) => [tank.tankId, tank])),
		[tanks]
	);
	const receivers = receiverIds.flatMap((id) => {
		const tank = tanksById.get(id);
		return tank ? [tank] : [];
	});
	const suppliers = supplierIds.flatMap((id) => {
		const tank = tanksById.get(id);
		return tank ? [tank] : [];
	});
	const receivingOptions = tanks
		.filter(
			(tank) => getSupplyPlanningRole(tank.balanceM3PerDay) === "receiver"
		)
		.sort((left, right) => left.tankId.localeCompare(right.tankId));
	const supplierOptions = useMemo(
		() =>
			receivers.length === 0 ?
				[]
			:	tanks
					.filter(
						(tank) =>
							getSupplyPlanningRole(tank.balanceM3PerDay) === "supplier" &&
							receivers.some(
								(receiver) =>
									getDistanceKm(receiver.coordinates, tank.coordinates) <=
									radiusKm
							)
					)
					.sort((left, right) => left.tankId.localeCompare(right.tankId)),
		[radiusKm, receivers, tanks]
	);
	const selectedComparisons = scenarios.filter((scenario) =>
		comparisonIds.includes(scenario.id)
	);
	const hasBalanceValues = tanks.some(
		(tank) =>
			tank.balanceM3PerDay !== null && Number.isFinite(tank.balanceM3PerDay)
	);
	const isEditing = editingScenarioId !== null;
	const canSave = draftName.trim().length > 0 && saveStatus !== "saving";

	const renderTankMetrics = (tank: SupplyPlanningTankOption) => (
		<div className='space-y-0.5 text-[9px] text-muted-foreground'>
			<p>
				Balance{" "}
				<span className='font-medium text-foreground'>
					{tank.balanceM3PerDay === null ?
						"not recorded"
					:	`${formatNumber(tank.balanceM3PerDay, 2)} m³/day`}
				</span>
				{" · "}
				{tank.waterSupply === null ?
					"Supply not recorded"
				:	`${formatNumber(tank.waterSupply)} L/person/day`}
			</p>
			<p>
				Population{" "}
				{tank.waterSupplyPopulation === null ?
					"not recorded"
				:	formatNumber(tank.waterSupplyPopulation, 0)}
				{" · "}Demand{" "}
				{tank.waterDemand === null ?
					"not recorded"
				:	`${formatNumber(tank.waterDemand, 2)} m³/day`}
			</p>
		</div>
	);

	return (
		<div aria-label='Supply by Planning scenario' className='space-y-3'>
			<section className='space-y-2 border-b border-border pb-3'>
				<div className='flex items-center justify-between gap-2'>
					<h3 className='text-[10px] font-semibold uppercase tracking-wide text-foreground'>
						Saved scenarios
					</h3>
					<Button
						className='h-6 px-2 text-[9px]'
						onClick={onCreateDraft}
						size='sm'
						variant='outline'>
						New draft
					</Button>
				</div>
				<div className='flex gap-1'>
					<select
						aria-label='Saved planning scenarios'
						className='h-8 min-w-0 flex-1 border border-input bg-background px-2 text-[10px] text-foreground'
						onChange={(event) => onSelectScenario(event.target.value)}
						value={selectedScenarioId}>
						<option value=''>Select a saved scenario</option>
						{scenarios.map((scenario) => (
							<option key={scenario.id} value={scenario.id}>
								{scenario.name}
							</option>
						))}
					</select>
					<Button
						className='h-8 px-2 text-[9px]'
						disabled={!selectedScenarioId || saveStatus === "loading"}
						onClick={onLoadScenario}
						size='sm'
						variant='secondary'>
						Open
					</Button>
				</div>

				{activeScenario && (
					<div className='space-y-1'>
						<p className='text-[10px] font-medium text-foreground'>
							Open · {activeScenario.name} · saved snapshot
						</p>
						<div className='flex flex-wrap gap-1'>
							<Button
								className='h-6 px-2 text-[9px]'
								onClick={onEditScenario}
								size='sm'
								variant='outline'>
								Edit & recalculate
							</Button>
							<Button
								className='h-6 px-2 text-[9px]'
								onClick={onDuplicateScenario}
								size='sm'
								variant='outline'>
								Duplicate
							</Button>
							<Button
								className='h-6 px-2 text-[9px]'
								onClick={onRenameScenario}
								size='sm'
								variant='outline'>
								Rename
							</Button>
							<Button
								className='h-6 px-2 text-[9px] text-destructive'
								onClick={onDeleteScenario}
								size='sm'
								variant='ghost'>
								Delete
							</Button>
						</div>
					</div>
				)}

				{scenarios.length === 0 && saveStatus === "loaded" && (
					<p className='text-[9px] text-muted-foreground'>
						No saved scenarios yet. Your draft is only in this browser session
						until you choose Save Scenario.
					</p>
				)}
				{saveStatus === "loading" && (
					<p className='text-[9px] text-muted-foreground' role='status'>
						Loading saved scenarios…
					</p>
				)}
				{saveError && (
					<p className='text-[9px] text-destructive' role='alert'>
						{saveError}
					</p>
				)}
			</section>

			<section className='space-y-2 border-b border-border pb-3'>
				<h3 className='text-[10px] font-semibold uppercase tracking-wide text-foreground'>
					{activeScenario && !isEditing ?
						"Saved result snapshot"
					:	"Working draft"}
				</h3>
				{activeScenario && !isEditing ?
					<p className='text-[9px] leading-relaxed text-muted-foreground'>
						Opened from its saved balance snapshots; it has not been
						recalculated. Choose Edit &amp; recalculate to use current source
						data.
					</p>
				:	<>
						<label className='block space-y-1 text-[9px] text-muted-foreground'>
							<span>Scenario name (required)</span>
							<input
								className='h-8 w-full border border-input bg-background px-2 text-[10px] text-foreground'
								maxLength={160}
								onChange={(event) => onDraftNameChange(event.target.value)}
								placeholder='e.g. Don bosco emergency support'
								value={draftName}
							/>
						</label>
						<label className='block space-y-1 text-[9px] text-muted-foreground'>
							<span>Description (optional)</span>
							<textarea
								className='min-h-14 w-full resize-y border border-input bg-background px-2 py-1.5 text-[10px] text-foreground'
								maxLength={5000}
								onChange={(event) =>
									onDraftDescriptionChange(event.target.value)
								}
								placeholder='Planning notes'
								value={draftDescription}
							/>
						</label>
						<div className='flex flex-wrap gap-1'>
							<Button
								className='h-7 px-2 text-[9px]'
								disabled={!canSave}
								onClick={onSaveScenario}
								size='sm'
								variant='default'>
								{saveStatus === "saving" ?
									"Saving…"
								: isEditing ?
									"Save changes"
								:	"Save Scenario"}
							</Button>
							{isEditing && (
								<Button
									className='h-7 px-2 text-[9px]'
									onClick={onClear}
									size='sm'
									variant='outline'>
									Cancel edit
								</Button>
							)}
						</div>
						<p className='text-[9px] text-muted-foreground'>
							Changes stay in this working draft unless you explicitly save.
						</p>
					</>
				}
			</section>

			<section className='space-y-1.5 border-b border-border pb-3'>
				<h3 className='text-[10px] font-semibold uppercase tracking-wide text-foreground'>
					Compare saved scenarios
				</h3>
				{scenarios.length < 2 ?
					<p className='text-[9px] text-muted-foreground'>
						Save at least two scenarios to compare their stored snapshots.
					</p>
				:	<div className='max-h-28 space-y-1 overflow-y-auto'>
						{scenarios.map((scenario) => (
							<label
								className='flex items-center gap-2 text-[9px]'
								key={scenario.id}>
								<input
									checked={comparisonIds.includes(scenario.id)}
									onChange={() => onToggleComparison(scenario.id)}
									type='checkbox'
								/>
								<span className='min-w-0 flex-1 truncate'>{scenario.name}</span>
								<span className='text-muted-foreground'>
									{formatNumber(numeric(scenario.totalAllocatedM3PerDay), 2)}{" "}
									m³/day
								</span>
							</label>
						))}
					</div>
				}
				{selectedComparisons.length >= 2 && (
					<div className='max-h-36 overflow-auto border-t border-border pt-1.5'>
						<table className='w-full text-left text-[8px]'>
							<thead className='text-muted-foreground'>
								<tr>
									<th className='py-1 pr-1'>Scenario</th>
									<th className='py-1 px-1'>Water</th>
									<th className='py-1 px-1'>Resolved</th>
									<th className='py-1 px-1'>Partial</th>
									<th className='py-1 pl-1'>Remaining</th>
								</tr>
							</thead>
							<tbody>
								{selectedComparisons.map((scenario) => (
									<tr className='border-t border-border/60' key={scenario.id}>
										<td className='max-w-20 truncate py-1 pr-1'>
											{scenario.name}
										</td>
										<td className='px-1'>
											{formatNumber(
												numeric(scenario.totalAllocatedM3PerDay),
												2
											)}
										</td>
										<td className='px-1'>{scenario.fullyResolvedDeficits}</td>
										<td className='px-1'>
											{scenario.partiallyResolvedDeficits}
										</td>
										<td className='pl-1'>{scenario.remainingDeficits}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			<div className='flex items-start justify-between gap-2'>
				<p className='text-[10px] leading-relaxed text-muted-foreground'>
					Plan temporary allocations from surplus tanks to one or more deficient
					tanks.
				</p>
				<Button
					className='h-6 shrink-0 px-2 text-[9px]'
					disabled={receiverIds.length === 0 && supplierIds.length === 0}
					onClick={onClear}
					size='sm'
					variant='outline'>
					Clear draft
				</Button>
			</div>

			{status === "loading" && (
				<p className='text-[10px] text-muted-foreground' role='status'>
					Loading recorded tank balances…
				</p>
			)}
			{status === "loaded" && tankLayerStatus === "loading" && (
				<p className='text-[10px] text-muted-foreground' role='status'>
					Loading tank locations…
				</p>
			)}
			{status === "loaded" && tankLayerStatus === "error" && (
				<p className='text-[10px] text-destructive' role='alert'>
					Tank locations could not be loaded, so no spatial scenario can be
					calculated.
				</p>
			)}
			{status === "error" && (
				<p className='text-[10px] text-destructive' role='alert'>
					{error ?? "Unable to load tank balance data."}
				</p>
			)}

			{status === "loaded" &&
				tankLayerStatus !== "loading" &&
				tankLayerStatus !== "error" &&
				tanks.length > 0 &&
				hasBalanceValues && (
					<>
						<div className='space-y-1'>
							<label
								className='text-[9px] font-medium uppercase tracking-wide text-muted-foreground'
								htmlFor='supply-planning-radius'>
								Supplier proximity · km
							</label>
							<input
								className='h-8 w-full border border-input bg-background px-2 text-[10px] text-foreground'
								id='supply-planning-radius'
								max={20}
								min={0.25}
								onChange={(event) => onRadiusChange(Number(event.target.value))}
								step={0.25}
								type='number'
								value={radiusKm}
							/>
							<p className='text-[9px] text-muted-foreground'>
								Straight-line distance; defaults to 2 km. Click map tank markers
								or use the selectors below.
							</p>
						</div>

						<section className='space-y-1'>
							<h3 className='text-[9px] font-semibold uppercase tracking-wide text-muted-foreground'>
								Deficient receiving tanks · {receiverIds.length} selected
							</h3>
							<div className='max-h-36 space-y-1 overflow-y-auto pr-1'>
								{receivingOptions.map((tank) => (
									<label
										className='flex items-start gap-2 border border-border/70 px-2 py-1.5'
										key={tank.tankId}>
										<input
											checked={receiverIds.includes(tank.tankId)}
											className='mt-0.5'
											onChange={() => onToggleReceiver(tank.tankId)}
											type='checkbox'
										/>
										<span className='min-w-0 flex-1'>
											<span className='block truncate text-[10px] font-medium text-foreground'>
												{tank.tankId}
											</span>
											{renderTankMetrics(tank)}
											<span className='block text-[9px] text-muted-foreground'>
												Deficit equivalent{" "}
												{formatNumber(
													getPopulationEquivalent(tank.balanceM3PerDay) ?? 0
												)}{" "}
												people
												{(
													tankServiceGroups.get(tank.tankId)?.serviceCodes
														.length
												) ?
													` · serves ${tankServiceGroups.get(tank.tankId)?.serviceCodes.join(", ")}`
												:	""}
											</span>
										</span>
									</label>
								))}
							</div>
							{receivingOptions.length === 0 && (
								<p className='text-[9px] text-muted-foreground'>
									No tanks with recorded negative balances are available.
								</p>
							)}
						</section>

						{receiverIds.length > 0 && (
							<section className='space-y-1'>
								<h3 className='text-[9px] font-semibold uppercase tracking-wide text-muted-foreground'>
									Nearby surplus suppliers · {supplierOptions.length} eligible
								</h3>
								{supplierOptions.length === 0 ?
									<p className='text-[9px] text-muted-foreground'>
										No recorded positive-balance tanks are within the radius of
										a selected receiver.
									</p>
								:	<div className='max-h-36 space-y-1 overflow-y-auto pr-1'>
										{supplierOptions.map((tank) => {
											const distance = Math.min(
												...receivers.map((receiver) =>
													getDistanceKm(receiver.coordinates, tank.coordinates)
												)
											);
											return (
												<label
													className='flex items-start gap-2 border border-border/70 px-2 py-1.5'
													key={tank.tankId}>
													<input
														checked={supplierIds.includes(tank.tankId)}
														className='mt-0.5'
														onChange={() => onToggleSupplier(tank.tankId)}
														type='checkbox'
													/>
													<span className='min-w-0 flex-1'>
														<span className='block truncate text-[10px] font-medium text-foreground'>
															{tank.tankId}
														</span>
														{renderTankMetrics(tank)}
														<span className='block text-[9px] text-muted-foreground'>
															Nearest selected receiver{" "}
															{formatNumber(distance, 2)} km · surplus capacity{" "}
															{formatNumber(
																getPopulationEquivalent(tank.balanceM3PerDay) ??
																	0
															)}{" "}
															people
														</span>
													</span>
												</label>
											);
										})}
									</div>
								}
							</section>
						)}

						{receiverIds.length > 0 && supplierIds.length > 0 && (
							<section className='space-y-2 border-t border-border pt-2'>
								<h3 className='text-[9px] font-semibold uppercase tracking-wide text-muted-foreground'>
									Allocate population equivalents
								</h3>
								{receivers.map((receiver) => (
									<div
										className='space-y-1 border-b border-border/60 pb-2'
										key={receiver.tankId}>
										<div className='flex flex-wrap items-baseline justify-between gap-x-2'>
											<p className='text-[10px] font-medium text-foreground'>
												Receiver · {receiver.tankId}
											</p>
											<p className='text-[8px] text-muted-foreground'>
												Remaining deficit{" "}
												{formatNumber(
													Math.max(
														0,
														(getPopulationEquivalent(
															receiver.balanceM3PerDay
														) ?? 0) -
															getAssignedPopulation(
																allocations,
																receiver.tankId,
																1
															)
													),
													0
												)}{" "}
												people
											</p>
										</div>
										{suppliers.map((supplier) => {
											const distanceKm = getDistanceKm(
												receiver.coordinates,
												supplier.coordinates
											);
											if (distanceKm > radiusKm) return null;
											const key = supplyPlanningAllocationKey(
												supplier.tankId,
												receiver.tankId
											);
											const current = allocations[key] ?? 0;
											const supplierCapacity =
												getPopulationEquivalent(supplier.balanceM3PerDay) ?? 0;
											const supplierOtherAssignments =
												getAssignedPopulation(
													allocations,
													supplier.tankId,
													0,
													key
												);
											const maxAllocation = Math.floor(
												Math.max(
													0,
													supplierCapacity - supplierOtherAssignments
												)
											);
											const remainingSupplierPopulation = Math.max(
												0,
												supplierCapacity -
													supplierOtherAssignments -
													current
											);
											return (
												<div
													className='grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-2'
													key={key}>
													<div className='min-w-0'>
														<p className='truncate text-[9px] font-medium text-foreground'>
															{supplier.tankId} · {formatNumber(distanceKm, 2)}{" "}
															km
														</p>
														<p className='text-[8px] text-muted-foreground'>
															Remaining supplier balance{" "}
															{formatNumber(
																remainingSupplierPopulation,
																0
															)}{" "}
															people
														</p>
													</div>
													<input
														aria-label={`Population allocated from ${supplier.tankId} to ${receiver.tankId}`}
														className='h-7 min-w-0 w-full border border-input bg-background px-1.5 text-[10px] text-foreground'
														max={maxAllocation}
														min={0}
														onChange={(event) =>
															onAllocationChange(
																key,
																event.target.value === "" ?
																	0
																:	Number(event.target.value)
															)
														}
														step={1}
														type='number'
														placeholder='0'
														value={current || ""}
													/>
												</div>
											);
										})}
									</div>
								))}

								<div className='space-y-1 text-[9px]'>
									<p className='flex justify-between'>
										<span>Total hypothetical allocation</span>
										<span className='font-medium text-foreground'>
											{formatNumber(results.totalAllocatedM3PerDay, 2)} m³/day
										</span>
									</p>
									<p className='flex justify-between'>
										<span>Resolved · partial · remaining deficits</span>
										<span className='font-medium text-foreground'>
											{results.fullyResolvedDeficits} ·{" "}
											{results.partiallyResolvedDeficits} ·{" "}
											{results.remainingDeficits}
										</span>
									</p>
									{results.invalidAllocation && (
										<p className='text-destructive' role='alert'>
											An allocation exceeds a recorded balance or is outside the
											proximity limit.
										</p>
									)}
									{results.allocations.length > 0 &&
										!results.invalidAllocation && (
											<p className='text-emerald-400' role='status'>
												Balances and distances satisfy the preliminary planning
												checks.
											</p>
										)}
								</div>
							</section>
						)}
					</>
				)}

			{(activeScenario || scenarioMapView) && (
				<section className='space-y-2 border-t border-border pt-2'>
					<h3 className='text-[10px] font-semibold uppercase tracking-wide text-foreground'>
						Scenario map
					</h3>
					<div className='flex gap-1'>
						<Button
							aria-pressed={!scenarioMapView}
							className='h-7 flex-1 px-1 text-[9px]'
							onClick={() => onToggleScenarioMap(false)}
							size='sm'
							variant={!scenarioMapView ? "secondary" : "outline"}>
							Original Water Balance
						</Button>
						<Button
							aria-pressed={scenarioMapView}
							className='h-7 flex-1 px-1 text-[9px]'
							onClick={() => onToggleScenarioMap(true)}
							size='sm'
							variant={scenarioMapView ? "secondary" : "outline"}>
							Scenario view
						</Button>
					</div>
					{scenarioMapView && (
						<div className='space-y-1.5'>
							<label className='flex items-center gap-2 text-[9px]'>
								<input
									checked={showAllocationConnections}
									onChange={(event) =>
										onToggleAllocationConnections(event.target.checked)
									}
									type='checkbox'
								/>
								Show hypothetical allocation connections
							</label>
							<label className='flex items-center gap-2 text-[9px]'>
								<input
									checked={showScenarioServiceAreas}
									onChange={(event) =>
										onToggleScenarioServiceAreas(event.target.checked)
									}
									type='checkbox'
								/>
								Show temporary service-area overlays
							</label>
							<ul className='space-y-1 text-[8px] text-muted-foreground'>
								<li className='flex items-center gap-1.5'>
									<span
										aria-hidden='true'
										className='size-1.5 shrink-0 rounded-full bg-emerald-400'
									/>
									<span>Deficit resolved or non-negative</span>
								</li>
								<li className='flex items-center gap-1.5'>
									<span
										aria-hidden='true'
										className='size-1.5 shrink-0 rounded-full bg-amber-400'
									/>
									<span>Deficit partially reduced</span>
								</li>
								<li className='flex items-center gap-1.5'>
									<span
										aria-hidden='true'
										className='size-1.5 shrink-0 rounded-full bg-red-400'
									/>
									<span>Deficit remains</span>
								</li>
								<li>Dashed boundary · temporary supported service area</li>
								<li>
									Arrow and label · hypothetical allocation (m³/day), not a
									pipeline route
								</li>
							</ul>
						</div>
					)}
					<div className='max-h-36 space-y-1 overflow-y-auto'>
						{results.tankResults
							.filter(
								(result) =>
									result.allocatedInM3PerDay > 0 ||
									result.allocatedOutM3PerDay > 0
							)
							.map((result) => (
								<button
									className='flex w-full items-center justify-between gap-2 border border-border/70 px-2 py-1 text-left text-[9px] hover:bg-muted/50'
									key={result.tankId}
									onClick={() => onSelectTankResult(result.tankId)}
									type='button'>
									<span className='truncate'>{result.tankId}</span>
									<span className='shrink-0 text-muted-foreground'>
										{formatNumber(result.originalBalanceM3PerDay, 2)} →{" "}
										{formatNumber(result.scenarioBalanceM3PerDay, 2)} m³/day
									</span>
								</button>
							))}
						{results.allocations.map((allocation, index) => (
							<button
								className='flex w-full items-center justify-between gap-2 border border-border/70 px-2 py-1 text-left text-[8px] text-muted-foreground hover:bg-muted/50'
								key={`${allocation.supplyingTankId}:${allocation.receivingTankId}`}
								onClick={() => onSelectAllocation(index)}
								type='button'>
								<span className='truncate'>
									{allocation.supplyingTankId} → {allocation.receivingTankId}
								</span>
								<span className='shrink-0'>
									{formatNumber(allocation.allocatedWaterM3PerDay, 2)} m³/day ·{" "}
									{formatNumber(allocation.distanceM / 1000, 2)} km
								</span>
							</button>
						))}
					</div>
					{activeScenario && (
						<p className='text-[8px] text-muted-foreground'>
							Saved snapshot · calculated{" "}
							{new Date(activeScenario.calculatedAt).toLocaleString()}
							{" · "}source snapshot{" "}
							{new Date(activeScenario.sourceDataTimestamp).toLocaleString()}
						</p>
					)}
					<p className='text-[8px] leading-relaxed text-muted-foreground'>
						Planning estimates only. Scenario overlays do not change source data
						and do not verify operation, pipeline connections, or hydraulics.
					</p>
				</section>
			)}

			{selectionNotice && (
				<p
					className='border-t border-border pt-2 text-[9px] text-amber-200'
					role='status'>
					{selectionNotice}
				</p>
			)}
			{saveStatus === "saving" && (
				<p className='text-[9px] text-muted-foreground' role='status'>
					Saving scenario transactionally…
				</p>
			)}
			{saveError && (
				<p className='text-[9px] text-destructive' role='alert'>
					{saveError}
				</p>
			)}
		</div>
	);
}

export default SupplyByPlanningPanel;
