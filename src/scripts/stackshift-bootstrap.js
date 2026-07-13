import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createApiKeysWorkflow, createSalesChannelsWorkflow, linkSalesChannelsToApiKeyWorkflow, updateStoresWorkflow, } from "@medusajs/medusa/core-flows";
export default async function stackshiftBootstrap({ container }) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const storeService = container.resolve(Modules.STORE);
    const salesChannelService = container.resolve(Modules.SALES_CHANNEL);
    const [store] = await storeService.listStores();
    if (!store)
        throw new Error("Medusa did not create a default store");
    let [salesChannel] = await salesChannelService.listSalesChannels({
        name: "StackShift Storefront",
    });
    if (!salesChannel) {
        const { result } = await createSalesChannelsWorkflow(container).run({
            input: { salesChannelsData: [{ name: "StackShift Storefront" }] },
        });
        salesChannel = result[0];
    }
    if (store.default_sales_channel_id !== salesChannel.id) {
        await updateStoresWorkflow(container).run({
            input: {
                selector: { id: store.id },
                update: { default_sales_channel_id: salesChannel.id },
            },
        });
    }
    const queryResult = await query.graph({
        entity: "api_key",
        fields: ["id", "token", "sales_channels.id"],
        filters: { title: "StackShift Storefront", type: "publishable" },
    });
    let apiKey = queryResult.data[0];
    if (!apiKey) {
        const { result } = await createApiKeysWorkflow(container).run({
            input: {
                api_keys: [{
                        title: "StackShift Storefront",
                        type: "publishable",
                        created_by: "",
                    }],
            },
        });
        apiKey = result[0];
    }
    if (!apiKey.sales_channels?.some(({ id }) => id === salesChannel.id)) {
        await linkSalesChannelsToApiKeyWorkflow(container).run({
            input: { id: apiKey.id, add: [salesChannel.id] },
        });
    }
    logger.info(`STACKSHIFT_PUBLISHABLE_API_KEY=${apiKey.token}`);
    logger.info("StackShift Medusa bootstrap completed");
}
