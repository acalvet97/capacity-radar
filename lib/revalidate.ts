import { revalidatePath } from "next/cache";

/** Surfaces that read team capacity: member hours, reserved capacity, buffer. */
export function revalidateCapacitySurfaces() {
  revalidatePath("/dashboard");
  revalidatePath("/evaluate");
  revalidatePath("/settings");
}

/** Surfaces that read work items: create, update, delete, phase changes. */
export function revalidateWorkSurfaces() {
  revalidatePath("/dashboard");
  revalidatePath("/evaluate");
  revalidatePath("/committed-work");
}
