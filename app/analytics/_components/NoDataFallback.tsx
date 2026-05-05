import { Empty } from "antd";

const NoDataFallback = ({message}:{message:string}) => (
  <div className="flex justify-center items-center h-full">
    <Empty
      description={<span>{`No Data Available for ${message}`}</span>}
      imageStyle={{
        height: 60,
      }}
    />
  </div>
);

export default NoDataFallback;
