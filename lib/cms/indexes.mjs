export async function ensureContentIndexes(db) {
  const projects = db.collection('projects')
  await projects.createIndex({id:1},{unique:true,partialFilterExpression:{id:{$type:'number'}},name:'project_unique_id'})
  await projects.createIndex({slug:1},{unique:true,partialFilterExpression:{slug:{$type:'string'}},name:'project_unique_slug'})
  await projects.createIndex({canonicalUrl:1},{unique:true,partialFilterExpression:{canonicalUrl:{$type:'string'}},name:'project_unique_deployment'})
  await projects.createIndex({routeId:1},{unique:true,partialFilterExpression:{routeId:{$type:'string'}},name:'project_unique_route'})
  await db.collection('portfolio_content').createIndex({kind:1,slugs:1},{unique:true,partialFilterExpression:{kind:'notes'},name:'cms_note_slugs'})
  await projects.createIndex({deletedAt:1,visibility:1,order:1},{name:'project_active_order'})
  await db.collection('portfolio_content').createIndex({kind:1,deletedAt:1,'data.order':1},{name:'cms_active_order'})
}
